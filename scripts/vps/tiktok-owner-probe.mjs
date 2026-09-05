import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/snap/chromium/current/usr/lib/chromium-browser/chrome';
const PROFILE = path.join(os.homedir(), 'mmf-browser-profile');
const PORT = 9230;
const APP_NAME = 'M.M.F Publisher';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const child = spawn(CHROME, [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check','--window-size=1440,900',
  `--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,
  '--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'
], { stdio: ['ignore','ignore','ignore'] });

async function getTargets(){
  for(let i=0;i<120;i++){
    try{ const r=await fetch(`http://127.0.0.1:${PORT}/json`); if(r.ok) return await r.json(); }catch{}
    await sleep(250);
  }
  throw new Error('CDP_NOT_READY');
}
let ws, seq=0;
const pending=new Map();
function send(method,params={}){
  const id=++seq;
  ws.send(JSON.stringify({id,method,params}));
  return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
}
async function ev(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  return r?.result?.value;
}
async function navApps(){
  await send('Page.navigate',{url:'https://developers.tiktok.com/apps'});
  await sleep(5000);
}
async function openOwner(){
  for(let attempt=1;attempt<=3;attempt++){
    await navApps();
    const clicked=await ev(`(()=>{const v=e=>e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length);let e=[...document.querySelectorAll('button,a,[role="button"],div,span')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()==='Connect an app');if(!e)return 0;(e.closest('button,a,[role="button"]')||e).click();return 1})()`);
    console.log(`CONNECT_ATTEMPT_${attempt}=${clicked}`);
    if(!clicked) continue;
    for(let i=0;i<10;i++){
      await sleep(500);
      const ready=await ev(`(()=>{const t=document.body?.innerText||'';return /Individual/.test(t)&&/Organization/.test(t)&&/Confirm/.test(t)&&/owner/i.test(t)})()`);
      if(ready) return true;
    }
  }
  return false;
}
async function selectIndividual(){
  return JSON.parse(await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));let nodes=[...document.querySelectorAll('h1,h2,h3,h4,p,span,div,label')].filter(v);let anchor=nodes.find(e=>/select.*app owner/i.test((e.innerText||e.textContent||'').trim()))||nodes.find(e=>(e.innerText||e.textContent||'').trim()==='Ownership');if(!anchor)return JSON.stringify({status:'NO_OWNER_ANCHOR',confirm:0});let c=anchor;for(let i=0;i<10&&c;i++,c=c.parentElement){const t=c.innerText||'';if(/Individual/.test(t)&&/Organization/.test(t)&&/Confirm/.test(t)&&c.querySelector('button,[role="button"]'))break}if(!c)return JSON.stringify({status:'NO_CONTAINER',confirm:0});let ind=[...c.querySelectorAll('label,div,span')].filter(v).find(e=>(e.innerText||e.textContent||'').trim()==='Individual');if(!ind)return JSON.stringify({status:'INDIVIDUAL_NOT_FOUND',confirm:0});const row=ind.closest('label')||ind.parentElement;const radio=row?.querySelector?.('input[type="radio"],[role="radio"]');(radio||row||ind).click();let b=[...c.querySelectorAll('button,[role="button"]')].filter(v).find(e=>(e.innerText||e.textContent||'').trim()==='Confirm');if(!b)return JSON.stringify({status:'CONFIRM_NOT_FOUND',confirm:0});b.click();return JSON.stringify({status:'INDIVIDUAL_CONFIRMED',confirm:1})})()`));
}
async function focusName(){
  return await ev(`(()=>{const e=document.querySelector('#appName');if(!e)return 0;e.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(e,'');else e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
}
async function appTypeState(){
  const raw=await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),safe=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,120);const rs=[...document.querySelectorAll('input[type="radio"]')].filter(v).map((r,i)=>{let c=r.closest('label')||r.parentElement;for(let n=0;n<4&&c;n++,c=c.parentElement){const t=safe(c.innerText);if(t&&t.length<180)return {i,checked:!!r.checked,text:t};}return {i,checked:!!r.checked,text:''};});const b=[...document.querySelectorAll('button,[role="button"]')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()==='Create app');return {radios:rs,createDisabled:!b||!!b.disabled||b.getAttribute('aria-disabled')==='true'};})())`);
  return JSON.parse(raw||'{}');
}
async function clickSoleRadio(){
  return await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const rs=[...document.querySelectorAll('input[type="radio"]')].filter(v);if(rs.length!==1)return 0;const r=rs[0];if(!r.checked)(r.closest('label')||r).click();return 1})()`);
}
async function clickCreate(){
  return await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const b=[...document.querySelectorAll('button,[role="button"]')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()==='Create app');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return 0;b.click();return 1})()`);
}
async function inspectAfterCreate(){
  const raw=await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),safe=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,120);const t=document.body?.innerText||'';const lines=t.split(/\\n+/).map(safe).filter(x=>x&&/App details|Basic information|App name|Category|Description|Terms of Service|Privacy Policy|Platforms|Products|Scopes|Production|Draft|Website|Login Kit|Content Posting/i.test(x)).slice(0,80);const actions=[...document.querySelectorAll('button,[role="button"],a')].filter(v).map(e=>safe(e.innerText||e.textContent)).filter(x=>x&&x.length<100&&/save|add product|add platform|submit|edit|verify|configure|manage/i.test(x)).slice(0,40);return {path:location.pathname,nameVisible:t.includes(${JSON.stringify(APP_NAME)}),lines,actions};})())`);
  return JSON.parse(raw||'{}');
}

try{
  const targets=await getTargets();
  const page=targets.find(x=>x.type==='page');
  if(!page?.webSocketDebuggerUrl) throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await navApps();
  console.log('AUTH='+(/login/.test(String(await ev('location.pathname')))?'NOT_SAVED':'OK'));
  const opened=await openOwner();
  console.log('OWNER_UI_READY='+Number(opened));
  if(opened){
    const owner=await selectIndividual();
    console.log('OWNER_STATUS='+owner.status);
    console.log('OWNER_CONFIRMED='+owner.confirm);
    if(owner.confirm){
      await sleep(5500);
      const focused=await focusName();
      console.log('APP_NAME_FIELD='+focused);
      if(focused){
        await send('Input.insertText',{text:APP_NAME});
        await sleep(800);
        console.log('APP_NAME_TYPED=1');
        let type=await appTypeState();
        console.log('APP_TYPE_STATE='+JSON.stringify(type.radios||[]));
        console.log('CREATE_DISABLED_AFTER_NAME='+Number(!!type.createDisabled));
        if(type.createDisabled && (type.radios||[]).length===1){
          const selected=await clickSoleRadio();
          console.log('SOLE_APP_TYPE_SELECTED='+selected);
          await sleep(500);
          type=await appTypeState();
          console.log('CREATE_DISABLED_AFTER_TYPE='+Number(!!type.createDisabled));
        }
        const created=await clickCreate();
        console.log('CREATE_CLICKED='+created);
        if(created){
          await sleep(7000);
          const state=await inspectAfterCreate();
          console.log('APP_CREATED='+Number(!!state.nameVisible || !/^\/apps\/?$/.test(String(state.path||''))));
          console.log('APP_PATH='+String(state.path||'').replace(/[A-Za-z0-9_-]{12,}/g,'<id>'));
          console.log('APP_HINTS='+JSON.stringify(state.lines||[]));
          console.log('APP_ACTIONS='+JSON.stringify(state.actions||[]));
        }
      }
    }
  }
}catch(e){
  console.log('ERROR='+String(e.message||e));
  process.exitCode=1;
}finally{
  try{ws?.close();}catch{}
  try{child.kill('SIGTERM');}catch{}
  await sleep(300);
  try{child.kill('SIGKILL');}catch{}
}

// Trigger app-type selection run.
