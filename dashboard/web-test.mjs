#!/usr/bin/env node
// Executes the shipped IIFE in Chromium, with real React + React Query and a
// fixture HTTP API. No Composio accounts or production services are touched.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tests/ui/package.json'));
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const host = await build({ stdin: { contents: `
 import React from 'react'; import {createRoot} from 'react-dom/client';
 window.calls=[]; window.opened=[]; window.open=(...args)=>{window.opened.push(args);return null};
 window.root=createRoot(document.getElementById('root'));
 window.__HERMES_PLUGIN_SDK__={React,components:{
 Button:({variant,size,...props})=>React.createElement('button',props),
 Input:props=>React.createElement('input',props),Badge:props=>React.createElement('span',props)
 },fetchJSON:async(url,init={})=>{window.calls.push({url,credentials:init.credentials,body:init.body,contentType:new Headers(init.headers).get('content-type')});
 const r=await fetch(url,init);if(!r.ok)throw new Error(r.status+': '+await r.text());return r.json()}};
 window.__HERMES_PLUGINS__={register:(name,Component)=>{window.registered=name;window.root.render(React.createElement(Component))}};
 `, resolveDir: root }, bundle: true, write: false, nodePaths: [path.join(root, 'tests/ui/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } });
const bundle = await readFile(path.join(root,'dashboard/dist/index.js'));
const css = await readFile(path.join(root,'dashboard/dist/index.css'));
const row=(selector,alias,status)=>({key:selector,toolkit:'gmail',selector,alias,status,removable:true});
let rows=[row('gmail_one','personal','ACTIVE'),row('gmail_two','work','EXPIRED')];
let authorization='https://connect.composio.dev/link/lk_fixture';
let delay=0, catalogError=false;
const catalog=[{slug:'gmail',name:'Gmail',categories:['email'],managed_auth:true},{slug:'notion',name:'Notion',categories:['productivity'],managed_auth:true},{slug:'custom',name:'Custom',categories:['tools'],managed_auth:false},{slug:'public',name:'Public',categories:['tools'],no_auth:true},...Array.from({length:120},(_,i)=>({slug:'tool_'+i,name:'Tool '+i,categories:['tools'],managed_auth:true}))];
const server=http.createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/host.js'){res.setHeader('Content-Type','text/javascript');return res.end(host.outputFiles[0].contents)}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle)}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(url.pathname.startsWith('/api/plugins/composio-connections/')){
  const profile=url.searchParams.get('profile');assert.ok(profile==='default'||profile==='second');
  res.setHeader('Content-Type','application/json');
  if(url.pathname.endsWith('/connections'))return res.end(JSON.stringify({connections:profile==='default'?rows:[]}));
  if(url.pathname.endsWith('/services')){if(catalogError){res.statusCode=503;return res.end(JSON.stringify({error:{code:'catalog-unavailable'}}))}return res.end(JSON.stringify({items:catalog,total:catalog.length,complete:true}))}
  let body='';for await(const chunk of req)body+=chunk;
  const data=JSON.parse(body); assert.equal(req.headers['content-type'],'application/json');
  if(delay)await new Promise(r=>setTimeout(r,delay));
  if(url.pathname.endsWith('/connect'))return res.end(JSON.stringify({authorization_url:authorization,existing_keys:rows.map(r=>r.key)}));
  if(url.pathname.endsWith('/disconnect')){assert.equal(data.confirmed,true);rows=rows.filter(r=>r.selector!==data.selector);return res.end(JSON.stringify({removed:true}))}
 }
 res.setHeader('Content-Type','text/html');res.end('<html lang="es"><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/host.js"></script><script src="/bundle.js" data-hermes-profile="default" id="plugin"></script></body></html>');
 }catch(error){res.statusCode=500;res.end(String(error))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await expect(page.getByTestId('connection-row')).toHaveCount(2);
 assert.equal(await page.evaluate(()=>window.registered),'composio-connections');
 await page.getByLabel('Estado de conexión',{exact:true}).selectOption('EXPIRED');
 await expect(page.getByTestId('connection-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await page.getByLabel('Buscar conexiones',{exact:true}).fill('personal');
 await expect(page.getByTestId('connection-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Desconectar gmail_one',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.body).length,0);
 await page.getByRole('button',{name:'Desconectar gmail_one',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar desconexión',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Desconexión verificada');
 assert.equal(rows.length,1);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 const services=page.getByLabel('Catálogo de servicios',{exact:true});
 await expect(services.getByRole('button')).toHaveCount(48);
 await services.evaluate(el=>el.scrollTop=el.scrollHeight);
 await expect(services.getByRole('button')).toHaveCount(96);
 await page.getByLabel('Categoría',{exact:true}).selectOption('productivity');
 await expect(services.getByRole('button')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await page.getByLabel('Disponibilidad de conexión',{exact:true}).selectOption('connected');
 await expect(services.getByRole('button')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await page.getByLabel('Autenticación',{exact:true}).selectOption('none');
 await page.getByRole('button',{name:'Public',exact:true}).click();
 await expect(page.getByRole('button',{name:'Generar autorización',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await page.getByLabel('Buscar servicios',{exact:true}).fill('Notion');
 await expect(services.getByRole('button')).toHaveCount(1);
 await page.getByRole('button',{name:'Notion',exact:true}).click();
 await page.getByLabel('Alias de la nueva cuenta',{exact:true}).fill('web');
 await page.getByRole('button',{name:'Generar autorización',exact:true}).click();
 await page.getByRole('button',{name:'Abrir autorización',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.opened),[['https://connect.composio.dev/link/lk_fixture','_blank','noopener,noreferrer']]);
 const calls=await page.evaluate(()=>window.calls);
 assert.ok(calls.every(c=>c.credentials==='include'&&c.url.endsWith('?profile=default')));
 const connect=calls.find(c=>c.url.includes('/connect?'));
 assert.deepEqual(JSON.parse(connect.body),{toolkit:'notion',alias:'web'});
 assert.equal(connect.contentType,'application/json');
 await page.getByRole('button',{name:'Dejar de esperar',exact:true}).click();
 authorization='javascript:alert(1)';
 await page.getByRole('button',{name:'Generar autorización',exact:true}).click();
 await page.getByRole('button',{name:'Abrir autorización',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.opened)).length,1);
 await page.getByRole('button',{name:'Dejar de esperar',exact:true}).click();
 catalogError=true; await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('catálogo completo');
 await expect(services.getByRole('button')).toHaveCount(0);
 catalogError=false;await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(services.getByRole('button')).toHaveCount(1);
 // An in-flight mutation is owned by the old profile and cannot populate the new page.
 delay=300;
 await page.getByRole('button',{name:'Generar autorización',exact:true}).click();
 await page.evaluate(()=>{document.getElementById('plugin').remove();const script=document.createElement('script');script.src='/bundle.js';script.dataset.hermesProfile='second';document.body.appendChild(script)});
 await expect(page.locator('[data-composio-profile="second"]')).toBeVisible();
 await expect(page.getByText('0 de 0 conexiones',{exact:false})).toBeVisible();
 await page.waitForTimeout(500);
 await expect(page.getByRole('button',{name:'Abrir autorización',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Buscar conexiones',{exact:true})).toHaveValue('');
 const secondCalls=(await page.evaluate(()=>window.calls)).filter(c=>c.url.includes('profile=second'));
 assert.ok(secondCalls.length>0&&secondCalls.every(c=>!c.body));
 assert.deepEqual(errors,[]);
 console.log('PASS compiled dashboard: registration, real React/Query, account/category/link/auth/search filters, incremental scroll, confirmation+JSON disconnect, JSON connect, credentials, OAuth safety, catalog failures, in-flight profile isolation; no browser errors.');
}finally{await browser.close();await new Promise(r=>server.close(r))}
