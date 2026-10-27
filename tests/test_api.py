import asyncio
import importlib.util
import sys
from pathlib import Path
import httpx
from fastapi import FastAPI


def load_api():
    name='test_composio_api_standalone'
    spec=importlib.util.spec_from_file_location(name,Path(__file__).parents[1]/'dashboard/plugin_api.py')
    mod=importlib.util.module_from_spec(spec); sys.modules[name]=mod; spec.loader.exec_module(mod)
    return mod

def test_invalid_payloads_rejected():
    api=load_api(); app=FastAPI(); app.include_router(api.router)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            for data in [[],{'selector':'--help','confirmed':True},{'selector':'gmail_exact','confirmed':'yes'},{'selector':'gmail_exact','confirmed':True,'command':'id'}]:
                r=await client.post('/disconnect',json=data)
                assert r.status_code==400
                assert r.json()['error']['code']=='invalid-input'
            r=await client.post('/connect',content='no json',headers={'Content-Type':'application/json'})
            assert r.status_code==400
    asyncio.run(check())

def test_api_read_and_safe_errors():
    api=load_api(); app=FastAPI(); app.include_router(api.router)
    class Service:
        async def list_connections(self): return {'connections':[], 'scope':{'backend':'composio-cli'}}
    api.service=Service()
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
            r=await c.get('/connections'); assert r.status_code==200; assert r.json()['connections']==[]
    asyncio.run(check())
