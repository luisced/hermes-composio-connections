import asyncio
import json
from dashboard.service import ConnectionService

def test_identity_survives_list_reordering():
    async def run(order):
        async def reader(args): return json.dumps({'gmail':[{'word_id':x,'status':'ACTIVE'} for x in order]})
        return {r['selector']:r['key'] for r in (await ConnectionService(reader).list_connections())['connections']}
    assert asyncio.run(run(['one','two']))==asyncio.run(run(['two','one']))
