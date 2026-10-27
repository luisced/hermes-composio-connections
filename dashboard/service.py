"""Account identity and consumer connection rules."""
import json
import asyncio
import re
from urllib.parse import urlsplit
from collections import Counter
from .cli import run_cli, run_remove, ComposioError
from .catalog import Catalog

class ConnectionService:
    def __init__(self, runner=run_cli, remover=run_remove, catalog=None):
        self.runner = runner
        self.remover = remover
        self.mutating = False
        self.catalog = catalog if catalog is not None else Catalog()

    @staticmethod
    def validate_token(value):
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}', value):
            raise ComposioError('invalid-input')

    async def connect(self, toolkit: str, alias: str | None) -> dict:
        self.validate_token(toolkit)
        if alias is not None: self.validate_token(alias)
        if self.mutating: raise ComposioError('busy')
        self.mutating = True
        try:
            rows = (await self.list_connections())['connections']
            existing = [r for r in rows if r['toolkit'] == toolkit]
            if existing and not alias: raise ComposioError('alias-required')
            if alias and any(r['alias'] and r['alias'].casefold() == alias.casefold() for r in existing):
                raise ComposioError('alias-duplicate')
            args = ['link', toolkit, '--no-browser', '--no-wait']
            if alias: args += ['--alias', alias]
            raw = await self.runner(args)
            try:
                payload = json.loads(raw)
                url = payload.get('redirect_url') or payload.get('authorization_url')
            except (ValueError, AttributeError):
                url = None
            # CLI versions also print prose around the authorization link.
            if not url:
                matches = re.findall(r'https://connect\.composio\.dev/link/[A-Za-z0-9_-]+', raw)
                url = matches[0] if len(set(matches)) == 1 else None
            parsed = urlsplit(url) if isinstance(url, str) else None
            if not parsed or parsed.scheme != 'https' or parsed.hostname != 'connect.composio.dev' or parsed.username or parsed.password or parsed.port or not re.fullmatch(r'/link/[A-Za-z0-9_-]+', parsed.path):
                raise ComposioError('authorization-unavailable')
            return {'authorization_url': url, 'existing_keys': [r['key'] for r in rows], 'existing_service_keys': [r['key'] for r in existing]}
        finally:
            self.mutating = False

    async def disconnect(self, selector: str, confirmed: bool) -> dict:
        if confirmed is not True: raise ComposioError('confirmation-required')
        self.validate_token(selector)
        if self.mutating: raise ComposioError('busy')
        self.mutating = True
        try:
            rows = (await self.list_connections())['connections']
            targets = [r for r in rows if r['selector'] == selector]
            if len(targets) != 1 or not targets[0]['removable']: raise ComposioError('account-changed')
            await self.remover(selector, targets[0]['toolkit'])
            after = (await self.list_connections())['connections']
            if any(r['selector'] == selector for r in after): raise ComposioError('removal-unverified')
            return {'removed': True, 'selector': selector}
        finally:
            self.mutating = False

    async def services(self, query: str) -> dict:
        if not isinstance(query, str) or len(query) > 200: raise ComposioError('invalid-input')
        catalog = await self.catalog.list()
        term = query.casefold()
        matches = [s for s in catalog['items'] if term in ' '.join([s['slug'], s['name'], s.get('description', ''), *s.get('categories', [])]).casefold()]
        return {**catalog, 'items': matches, 'matched': len(matches)}

    async def list_connections(self) -> dict:
        try:
            raw = json.loads(await self.runner(['connections', 'list']))
            if not isinstance(raw, dict): raise ValueError()
            rows = []
            for toolkit, accounts in raw.items():
                if not isinstance(toolkit, str) or not isinstance(accounts, list): raise ValueError()
                for i, item in enumerate(accounts):
                    if not isinstance(item, dict): raise ValueError()
                    if not isinstance(item.get('status'), str): raise ValueError()
                    for field in ('id', 'connected_account_id', 'word_id', 'alias'):
                        if item.get(field) is not None and not isinstance(item[field], str): raise ValueError()
                    selector = item.get('id') or item.get('connected_account_id') or item.get('word_id') or None
                    rows.append(dict(key=f'{toolkit}:{selector or "unidentified"}:{i}', toolkit=toolkit,
                        alias=item.get('alias'), alias_known='alias' in item, status=item['status'], selector=selector, removable=False))
            counts = Counter(r['selector'] for r in rows if r['selector'])
            for row in rows:
                row['removable'] = bool(row['selector'] and counts[row['selector']] == 1)
                if row['removable']: row['key'] = f"{row['toolkit']}:{row['selector']}"
            return {'connections': rows, 'scope': {'backend': 'composio-cli'}}
        except (ValueError, TypeError):
            raise ComposioError('invalid-output') from None
