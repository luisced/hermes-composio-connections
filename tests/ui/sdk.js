// Test bridge only; React and React Query are the real libraries.
import React,{useSyncExternalStore} from 'react';
export {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
const atom = value => { const listeners=new Set(); return {get:()=>value,set:v=>{value=v;listeners.forEach(f=>f())},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}} };
export const host={state:{connectionId:atom('host-a'),profile:atom('default'),gateway:atom('open')},navigate:()=>{},notify:()=>{}};
let epoch=1;
export const gatewayActivationEpoch=()=>epoch;
export const useValue=a=>useSyncExternalStore(a.subscribe,a.get);
export const ROUTES_AREA='routes',SIDEBAR_NAV_AREA='sidebar',PALETTE_AREA='palette';
export const Button=({children,variant,size,...p})=>React.createElement('button',p,children);
export const Input=p=>React.createElement('input',p);
export const Badge=({children,...p})=>React.createElement('span',p,children);
window.changeScope=()=>{epoch++;host.state.connectionId.set('host-b')};
window.sameProfileSwap=()=>{epoch++;host.state.gateway.set('connecting');host.state.gateway.set('open')};
