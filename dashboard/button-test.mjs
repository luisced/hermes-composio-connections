import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../tests/ui/package.json',import.meta.url));
const React=require('react');const {build}=require('esbuild');
globalThis.window={__HERMES_PLUGIN_SDK__:{React,fetchJSON:()=>{},components:{Button:()=>null,Input:()=>null,Badge:()=>null}},__HERMES_PLUGINS__:{}};
globalThis.document={currentScript:null};
const output=await build({entryPoints:[new URL('./web-sdk.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false,nodePaths:[new URL('../tests/ui/node_modules',import.meta.url).pathname]});
const {Button}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].contents).toString('base64'));
const click=()=>{};
for(const [variant,flag] of [['outline','outlined'],['ghost','ghost'],['destructive','destructive'],['default',null]]){
 const element=Button({variant,'aria-pressed':true,onClick:click,children:'test'});
 assert.equal(element.props.variant,undefined);
 if(flag)assert.equal(element.props[flag],true);
 else assert.equal(element.props.outlined,undefined);
 assert.equal(element.props['aria-pressed'],true);assert.equal(element.props.onClick,click);
}
console.log('PASS web Button maps Desktop variants to DS flags, preserving accessibility and actions');
