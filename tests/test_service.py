import asyncio
import json
import pytest

def service(raw):
    from dashboard.service import ConnectionService
    async def runner(args, **kwargs):
        assert args == ['connections', 'list']
        return json.dumps(raw)
    return ConnectionService(runner)

def test_preserves_expired_unnamed_and_duplicate_alias_rows():
    data = asyncio.run(service({'gmail': [
        {'alias': 'work', 'word_id': 'gmail_one', 'status': 'ACTIVE'},
        {'alias': 'work', 'word_id': 'gmail_two', 'status': 'EXPIRED'},
        {'alias': None, 'word_id': 'gmail_three', 'status': 'ACTIVE'}
    ]}).list_connections())
    assert len(data['connections']) == 3
    assert [x['selector'] for x in data['connections']] == ['gmail_one','gmail_two','gmail_three']
    assert data['connections'][1]['status'] == 'EXPIRED'
    assert data['connections'][2]['alias'] is None

def test_missing_selector_is_visible_not_removable():
    row = asyncio.run(service({'gmail': [{'status': 'ACTIVE'}]}).list_connections())['connections'][0]
    assert row['removable'] is False
    assert row['selector'] is None

def test_duplicate_selector_is_not_removable():
    rows = asyncio.run(service({'gmail': [{'word_id':'same','status':'ACTIVE'}, {'word_id':'same','status':'ACTIVE'}]}).list_connections())['connections']
    assert len({r['key'] for r in rows}) == 2
    assert all(not r['removable'] for r in rows)

@pytest.mark.parametrize('raw', [[], {'gmail': {}}, {'gmail':[None]}, {'gmail':[{'status':12}]}])
def test_malformed_output_fails_closed(raw):
    from dashboard.cli import ComposioError
    with pytest.raises(ComposioError, match='invalid-output'):
        asyncio.run(service(raw).list_connections())
