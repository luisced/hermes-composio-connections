import asyncio
import json
import pytest
from urllib.parse import parse_qs, urlsplit
from dashboard.cli import ComposioError


def item(slug, name=None, **extra):
    return {'slug': slug, 'name': name or slug, 'meta': {'description': 'Service catalog fixture', 'categories': []}, 'auth_schemes': ['OAUTH2'], 'composio_managed_auth_schemes': ['OAUTH2'], 'no_auth': False, **extra}


def credentials():
    return {'api_key': 'fixture-key', 'org_id': 'fixture-org', 'base_url': 'https://backend.composio.dev'}


def test_catalog_fetches_every_page_beyond_one_thousand_and_preserves_unconnected_services():
    from dashboard.catalog import Catalog
    calls = []
    def fetch(url, headers):
        assert headers['x-user-api-key'] == 'fixture-key'
        assert headers['x-org-id'] == 'fixture-org'
        calls.append(url)
        if 'cursor' not in parse_qs(urlsplit(url).query):
            return {'items': [item(f'app_{i}') for i in range(1000)], 'next_cursor': 'page-two', 'total_items': 1002}
        return {'items': [item('zendesk', 'Zendesk'), item('_1password', '1Password')], 'next_cursor': None, 'total_items': 1002}
    result = asyncio.run(Catalog(fetcher=fetch, credentials=credentials).list())
    assert result['complete'] is True
    assert result['total'] == len(result['items']) == 1002
    assert {'zendesk', '_1password'} <= {x['slug'] for x in result['items']}
    assert len(calls) == 2


def test_services_does_not_derive_the_catalog_from_connected_accounts():
    from dashboard.service import ConnectionService
    async def no_accounts(*args):
        pytest.fail('Catalog must not derive from connections list')
    class FakeCatalog:
        async def list(self):
            return {'items': [item('zendesk', 'Zendesk')], 'total': 1, 'complete': True, 'source': 'composio-toolkit-catalog'}
    result = asyncio.run(ConnectionService(runner=no_accounts, catalog=FakeCatalog()).services('Zendesk'))
    assert [x['slug'] for x in result['items']] == ['zendesk']
    assert result['complete'] is True


@pytest.mark.parametrize('mode', ['truncated', 'duplicate', 'cursor-loop', 'total-changed', 'invalid-slug'])
def test_partial_or_inconsistent_catalog_is_never_reported_complete(mode):
    from dashboard.catalog import Catalog
    count = 0
    def fetch(url, headers):
        nonlocal count
        count += 1
        if mode == 'invalid-slug': return {'items': [item('--unsafe')], 'total_items': 1, 'next_cursor': None}
        if mode == 'truncated': return {'items': [item('gmail')], 'total_items': 2, 'next_cursor': None}
        return {'items': [item('gmail' if count == 1 or mode == 'duplicate' else 'notion')], 'total_items': 3 if mode == 'total-changed' and count == 2 else 2, 'next_cursor': 'same' if count == 1 or mode == 'cursor-loop' else None}
    with pytest.raises(ComposioError, match='catalog-unavailable'):
        asyncio.run(Catalog(fetcher=fetch, credentials=credentials).list())


def test_cache_is_scoped_to_cli_auth_context_and_drops_unrecognized_fields():
    from dashboard.catalog import Catalog
    auth = credentials()
    calls = []
    def fetch(url, headers):
        calls.append(headers.copy())
        return {'items': [item('gmail', 'Gmail', credentials='never-forward')], 'next_cursor': None, 'total_items': 1}
    catalog = Catalog(fetcher=fetch, credentials=lambda: auth.copy())
    async def check():
        first = await catalog.list()
        assert 'credentials' not in first['items'][0]
        await catalog.list()
        assert len(calls) == 1
        auth['api_key'] = 'changed-key'
        await catalog.list()
        assert len(calls) == 2
        assert calls[1]['x-user-api-key'] == 'changed-key'
    asyncio.run(check())


def test_concurrent_catalog_timeouts_include_lock_wait_and_allow_retry(monkeypatch):
    from dashboard.catalog import Catalog
    real_timeout = asyncio.timeout
    deadlines = []

    def controlled_timeout(seconds):
        assert seconds == 45
        deadline = real_timeout(None)
        deadlines.append(deadline)
        return deadline

    monkeypatch.setattr('dashboard.catalog.asyncio.timeout', controlled_timeout)

    async def check():
        catalog = Catalog(credentials=credentials)
        started = asyncio.Event()
        allow_success = asyncio.Event()
        loads = 0
        result = {'items': [], 'total': 0, 'complete': True}

        async def load(auth):
            nonlocal loads
            loads += 1
            if not allow_success.is_set():
                started.set()
                await allow_success.wait()
            return result

        monkeypatch.setattr(catalog, '_load', load)
        tasks = [asyncio.create_task(catalog.list())]
        await started.wait()
        tasks.extend(asyncio.create_task(catalog.list()) for _ in range(2))
        # Let both concurrent callers reach the held lock before expiring
        # their request budgets together, without a wall-clock timing race.
        await asyncio.sleep(0)
        for deadline in deadlines:
            deadline.reschedule(asyncio.get_running_loop().time())
        try:
            done, pending = await asyncio.wait(tasks, timeout=1)
            assert not pending, 'Catalog callers must time out while waiting for the lock'
            for task in done:
                with pytest.raises(ComposioError, match='^catalog-unavailable$'):
                    task.result()
            assert loads == 1
            assert catalog.cached is None
            assert not catalog.lock.locked()
            allow_success.set()
            assert await catalog.list() == result
            assert await catalog.list() == result
            assert loads == 2
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    asyncio.run(check())


def test_catalog_retains_no_auth_and_custom_configuration_services():
    from dashboard.catalog import Catalog
    def fetch(url, headers):
        return {'items': [item('public_api', no_auth=True, auth_schemes=['NO_AUTH'], composio_managed_auth_schemes=[]), item('private_api', auth_schemes=['API_KEY'], composio_managed_auth_schemes=[])], 'next_cursor': None, 'total_items': 2}
    result = asyncio.run(Catalog(fetcher=fetch, credentials=credentials).list())
    assert len(result['items']) == 2
    assert result['items'][1]['no_auth'] is True  # alphabetically public_api comes last
    assert result['items'][0]['managed_auth'] is False


def test_catalog_credentials_use_hermes_secret_and_ignore_cli_store(monkeypatch, tmp_path):
    from dashboard.catalog import cli_credentials
    seen = []
    monkeypatch.setattr('pathlib.Path.read_text', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('credential file read')))
    monkeypatch.setenv('COMPOSIO_USER_API_KEY', 'env-must-not-win')
    (tmp_path / 'user_data.json').write_text(json.dumps({'api_key': 'file-must-not-win', 'org_id': 'org', 'base_url': 'https://untrusted.example'}))
    monkeypatch.chdir(tmp_path)
    assert cli_credentials(lambda name: seen.append(name) or 'hermes-secret') == {
        'api_key': 'hermes-secret', 'base_url': 'https://backend.composio.dev'
    }
    assert seen == ['COMPOSIO_USER_API_KEY']
    with pytest.raises(ComposioError, match='auth-required'):
        cli_credentials(lambda name: None)
    with pytest.raises(ComposioError, match='auth-required'):
        cli_credentials(lambda name: '   ')


def test_catalog_slugs_starting_with_underscore_are_valid_cli_arguments():
    from dashboard.service import ConnectionService
    ConnectionService.validate_token('_1password')

def test_http_redirect_never_forwards_cli_credentials():
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from threading import Thread
    from dashboard.catalog import fetch_page
    seen=[]
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append(self.path)
            self.send_response(302)
            self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/stolen')
            self.end_headers()
        def log_message(self, *args): pass
    server=HTTPServer(('127.0.0.1',0), Handler)
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with pytest.raises(ComposioError,match='catalog-unavailable'):
            fetch_page(f'http://127.0.0.1:{server.server_port}/catalog', {'x-user-api-key':'fixture-only'})
        assert seen==['/catalog']
    finally:
        server.shutdown();server.server_close();thread.join()

