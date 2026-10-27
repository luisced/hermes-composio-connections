import asyncio
import json
import pytest
from dashboard.service import ConnectionService
from dashboard.cli import ComposioError

ROW={'word_id':'gmail_exact','alias':'work','status':'ACTIVE'}

class Upstream:
    def __init__(self): self.rows=[dict(ROW)]; self.calls=[]; self.keep=False; self.url='https://connect.composio.dev/link/lk_test'
    async def run(self,args,**kwargs):
        self.calls.append(args)
        if args==['connections','list']: return json.dumps({'gmail':self.rows})
        if args[0]=='link': return json.dumps({'redirect_url':self.url})
        raise AssertionError(args)
    async def remove(self,selector,toolkit):
        assert (selector,toolkit)==('gmail_exact','gmail')
        self.calls.append(['remove',selector])
        if not self.keep: self.rows=[]
    def service(self): return ConnectionService(self.run,remover=self.remove)

def test_disconnect_never_uses_alias():
    u=Upstream()
    assert asyncio.run(u.service().disconnect('gmail_exact',True))=={'removed':True,'selector':'gmail_exact'}
    assert u.calls==[['connections','list'],['remove','gmail_exact'],['connections','list']]

def test_unconfirmed_delete_runs_nothing():
    u=Upstream()
    with pytest.raises(ComposioError,match='confirmation-required'): asyncio.run(u.service().disconnect('gmail_exact',False))
    assert not u.calls

def test_missing_after_refresh_returns_conflict():
    u=Upstream(); u.rows=[]
    with pytest.raises(ComposioError,match='account-changed'): asyncio.run(u.service().disconnect('gmail_exact',True))
    assert u.calls==[['connections','list']]

def test_zero_exit_still_present_is_failure():
    u=Upstream(); u.keep=True
    with pytest.raises(ComposioError,match='removal-unverified'): asyncio.run(u.service().disconnect('gmail_exact',True))

def test_duplicate_alias_connect_rejected():
    u=Upstream()
    with pytest.raises(ComposioError,match='alias-duplicate'): asyncio.run(u.service().connect('gmail','work'))
    assert all(c[0]!='link' for c in u.calls)

def test_additional_account_requires_alias():
    u=Upstream()
    with pytest.raises(ComposioError,match='alias-required'): asyncio.run(u.service().connect('gmail',None))

@pytest.mark.parametrize('url',['https://dashboard.composio.dev/setup','http://connect.composio.dev/link/x','https://connect.composio.dev.evil.test/link/x','https://connect.composio.dev@evil.test/link/x'])
def test_dashboard_url_is_not_oauth(url):
    u=Upstream(); u.url=url
    with pytest.raises(ComposioError,match='authorization-unavailable'): asyncio.run(u.service().connect('gmail','second'))

def test_connect_records_preexisting_identities():
    u=Upstream()
    result=asyncio.run(u.service().connect('gmail','second'))
    assert result['existing_keys']==['gmail:gmail_exact']
    assert result['authorization_url']=='https://connect.composio.dev/link/lk_test'
    assert u.calls[-1]==['link','gmail','--no-browser','--no-wait','--alias','second']

@pytest.mark.parametrize('toolkit,alias',[('--help',None),('gmail;id',None),('gmail','--help'),('gmail','x\ny')])
def test_invalid_inputs_never_execute(toolkit,alias):
    u=Upstream()
    with pytest.raises(ComposioError,match='invalid-input'): asyncio.run(u.service().connect(toolkit,alias))
    assert u.calls==[]

def test_catalog_query_filters_without_losing_completeness_metadata():
    class CatalogFixture:
        async def list(self):
            return {'items': [{'slug':'gmail','name':'Gmail'}, {'slug':'zendesk','name':'Zendesk'}], 'total':2, 'complete':True, 'source':'composio-toolkit-catalog'}
    u=Upstream()
    service=ConnectionService(u.run, catalog=CatalogFixture())
    result=asyncio.run(service.services('gma'))
    assert [r['slug'] for r in result['items']]==['gmail']
    assert result['complete'] is True and result['total']==2 and result['matched']==1
    assert u.calls==[]
