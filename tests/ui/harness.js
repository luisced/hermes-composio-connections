import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import plugin from '../../desktop/plugin.js';
const row=(key,alias,status)=>({key:'gmail:'+key,toolkit:'gmail',alias,status,selector:key,removable:true});
window.fixture={rows:[row('gmail_one','personal','ACTIVE'),row('gmail_two','work','EXPIRED'),row('gmail_three',null,'ACTIVE')],calls:[],opened:[],delay:0,error:null};
let render; window.registrations=[]; window.navigated=null;
const ctx={register:c=>{window.registrations.push(c);if(c.area==='routes')render=c.render},os:{openExternal:async url=>{window.fixture.opened.push(url);return true}},rest:async(path,options={})=>{
 const f=window.fixture; const scope=window.scopeName||'a'; f.calls.push({path,body:options.body,scope});
 if(f.delay && options.method==='POST')await new Promise(r=>setTimeout(r,f.delay));
 if(f.error){const e=new Error(f.error);e.statusCode=404;throw e}
 if(path==='/connections')return {connections:scope==='a'?structuredClone(f.rows):[],scope:{backend:'composio-cli'}};
 if(path.startsWith('/services') && f.catalogError)throw new Error(f.catalogError);
 if(path.startsWith('/services'))return {items:structuredClone(f.catalog || [{slug:'gmail',name:'Gmail',managed_auth:true}]),complete:true,total:(f.catalog || [1]).length,source:'composio-toolkit-catalog'};
 if(path==='/connect')return {authorization_url:'https://connect.composio.dev/link/lk_fixture',existing_keys:f.rows.map(x=>x.key)};
 if(path==='/disconnect'){f.rows=f.rows.filter(x=>x.selector!==options.body.selector);return {removed:true,selector:options.body.selector}}
 throw Error('Unexpected fixture request');
}};
plugin.register(ctx);
const change=window.changeScope;window.changeScope=()=>{window.scopeName='b';change()};
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient()},render()));
