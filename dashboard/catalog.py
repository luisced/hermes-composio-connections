"""Read-only toolkit metadata, using existing Composio CLI user authentication.

This is discovery only. Account inventory, OAuth and removal remain CLI-backed.
Never start a developer session or infer catalog completeness from the CLI cache.
"""
import asyncio
import hashlib
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .cli import ComposioError

ORIGIN = 'https://backend.composio.dev'


def cli_credentials(secret=None):
    """Catalog auth comes only from Hermes's profile-scoped secret store.

    Never open the Composio CLI credential file, another profile's environment,
    or a caller-supplied base URL.
    """
    if secret is None:
        try:
            from agent.secret_scope import get_secret
        except ImportError:
            raise ComposioError('auth-required') from None
        secret = get_secret
    try:
        key = secret('COMPOSIO_USER_API_KEY')
    except Exception:
        raise ComposioError('auth-required') from None
    if not isinstance(key, str) or not key.strip():
        raise ComposioError('auth-required')
    return {'api_key': key.strip(), 'base_url': ORIGIN}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_page(url, headers):
    try:
        with build_opener(NoRedirect()).open(Request(url, headers=headers), timeout=15) as response:
            body = response.read(8_000_001)
        if len(body) > 8_000_000: raise ValueError()
        return json.loads(body)
    except HTTPError as exc:
        raise ComposioError('auth-required' if exc.code in (401, 403) else 'catalog-unavailable') from None
    except (OSError, URLError, ValueError):
        raise ComposioError('catalog-unavailable') from None


def normalize(item):
    if not isinstance(item, dict): raise ValueError()
    slug, name = item.get('slug'), item.get('name')
    if not isinstance(slug, str) or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}', slug): raise ValueError()
    if not isinstance(name, str) or not name or len(name) > 500: raise ValueError()
    meta = item.get('meta') or {}
    if not isinstance(meta, dict): raise ValueError()
    description = meta.get('description') or ''
    categories = meta.get('categories') or []
    modes = item.get('auth_schemes') or []
    managed = item.get('composio_managed_auth_schemes') or []
    if not isinstance(description, str) or not isinstance(categories, list): raise ValueError()
    if not isinstance(modes, list) or not isinstance(managed, list) or not all(isinstance(x, str) for x in modes + managed): raise ValueError()
    return {'slug': slug, 'name': name, 'description': description[:500],
            'categories': [c['name'] for c in categories if isinstance(c, dict) and isinstance(c.get('name'), str)],
            'auth_schemes': modes, 'managed_auth': bool(managed),
            'no_auth': item.get('no_auth') is True, 'deprecated': item.get('deprecated') is True}


class Catalog:
    def __init__(self, fetcher=fetch_page, credentials=cli_credentials):
        self.fetcher = fetcher
        self.credentials = credentials
        self.lock = asyncio.Lock()
        self.cached = None
        self.context = None
        self.cached_at = 0

    async def list(self):
        auth = self.credentials()
        context = hashlib.sha256(json.dumps(auth, sort_keys=True).encode()).digest()
        try:
            async with asyncio.timeout(45):
                async with self.lock:
                    if self.cached is not None and self.context == context and time.monotonic() - self.cached_at < 300:
                        return self.cached
                    result = await self._load(auth)
                    self.cached, self.context, self.cached_at = result, context, time.monotonic()
                    return result
        except ComposioError:
            raise
        except (ValueError, TypeError, KeyError, TimeoutError):
            raise ComposioError('catalog-unavailable') from None

    async def _load(self, auth):
        headers = {'x-user-api-key': auth['api_key'], 'Accept': 'application/json', 'User-Agent': 'Hermes-Composio-Connections'}
        if auth.get('org_id'): headers['x-org-id'] = auth['org_id']
        items, slugs, cursors = [], set(), set()
        cursor, total = None, None
        for _ in range(50):
            params: dict[str, int | str] = {'limit': 1000}
            if cursor: params['cursor'] = cursor
            # Same supported v3 metadata endpoint used by the installed CLI.
            url = ORIGIN + '/api/v3/toolkits?' + urlencode(params)
            page = await asyncio.to_thread(self.fetcher, url, headers)
            if not isinstance(page, dict) or not isinstance(page.get('items'), list): raise ValueError()
            count = page.get('total_items')
            if type(count) is not int or count < 0 or (total is not None and total != count): raise ValueError()
            total = count
            for raw in page['items']:
                row = normalize(raw)
                if row['slug'] in slugs: raise ValueError()
                slugs.add(row['slug']); items.append(row)
            cursor = page.get('next_cursor')
            if cursor is None or cursor == '':
                if len(items) != total: raise ValueError()
                return {'items': sorted(items, key=lambda r: r['name'].casefold()), 'total': total, 'complete': True, 'source': 'composio-toolkit-catalog'}
            if not isinstance(cursor, str) or len(cursor) > 2048 or cursor in cursors or not page['items']: raise ValueError()
            cursors.add(cursor)
        raise ValueError()
