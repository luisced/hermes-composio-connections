import React from 'react';
import {createRoot} from 'react-dom/client';
const row=(key,alias,status)=>({key:'gmail:'+key,toolkit:'gmail',alias,status,selector:key,removable:true});
window.fixture={rows:[row('gmail_one','personal','ACTIVE'),row('gmail_two','work','EXPIRED'),row('gmail_three',null,'ACTIVE')],calls:[],opened:[],catalog:[{slug:'gmail',name:'Gmail',categories:['communication'],managed_auth:true},{slug:'slack',name:'Slack',categories:['communication'],managed_auth:true},{slug:'zendesk',name:'Zendesk',categories:['crm'],managed_auth:false}]};
window.open=(url,target,features)=>{window.fixture.opened.push({url,target,features});return {opener:null}};
const root=createRoot(document.getElementById('root'));
const Button=({children,variant,size,...p})=>React.createElement('button',p,children);
const Input=p=>React.createElement('input',p);
const Badge=({children,...p})=>React.createElement('span',p,children);
window.__HERMES_PLUGIN_SDK__={React,components:{Button,Input,Badge},fetchJSON:async(url,options={})=>{
 const path=new URL(url,location.origin).pathname.replace('/api/plugins/composio-connections','');
 const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
 const f=window.fixture; f.calls.push({url,path,body,headers:options.headers,method:options.method});
 if(path==='/connections')return {connections:structuredClone(f.rows),scope:{backend:'composio-cli'}};
 if(path==='/services')return {items:structuredClone(f.catalog),complete:true,total:f.catalog.length,source:'composio-toolkit-catalog'};
 if(path==='/connect')return {authorization_url:'https://connect.composio.dev/link/lk_fixture',existing_keys:f.rows.map(x=>x.key)};
 if(path==='/disconnect'){f.rows=f.rows.filter(x=>x.selector!==body.selector);return {removed:true,selector:body.selector}}
 throw Error('Unexpected dashboard request '+url);
}};
window.__HERMES_PLUGINS__={register:(name,Component)=>{window.registeredPlugin=name;root.render(React.createElement(Component))}};
const script=document.createElement('script');
script.dataset.hermesProfile='default';
script.src='/fixture-dashboard.js';
script.onerror=()=>{document.getElementById('root').textContent='Bundle load failed'};
document.head.append(script);
