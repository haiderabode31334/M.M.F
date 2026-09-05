import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const C='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const P=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9235;
const APP='M.M.F Publisher';
const sleep=m=>new Promise(r=>setTimeout(r,m));
const ch=spawn(C,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=1440,1000',`--user-data-dir=${P}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
let ws,s=0;const q=new Map();
function send(method,params={}){const id=++s;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>q.set(id,{resolve,reject}));}
async function ev(x){const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function ready(){for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return r.json();}catch{}await sleep(250);}throw Error('CDP_NOT_READY');}
async function nav(u,m=5000){await send('Page.navigate',{url:u});await sleep(m);}
async function clickExact(t){return ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),q=${JSON.stringify(t)};let e=[...document.querySelectorAll('a,button,[role="button"],div,span')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()===q);if(!e)return 0;(e.closest('a,button,[role="button"]')||e).click();return 1})()`);}
async function searchApp(){
  for(let i=0;i<12;i++){if(await clickExact(APP))return 1;await sleep(500);}
  const focused=await ev(`(()=>{const e=[...document.querySelectorAll('input')].find(x=>/search by name/i.test(x.placeholder||''));if(!e)return 0;e.focus();return 1})()`);
  if(focused){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await send('Input.insertText',{text:APP});await sleep(1800);for(let i=0;i<12;i++){if(await clickExact(APP))return 1;await sleep(400);}}
  return 0;
}

try{
  const ts=await ready(),p=ts.find(x=>x.type==='page');
  ws=new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);r();};ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const p=q.get(m.id);q.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable');await send('Runtime.enable');
  await nav('https://developers.tiktok.com/apps',6500);
  const openedApp=await searchApp();console.log('APP_OPENED='+openedApp);if(!openedApp)throw Error('APP_NOT_FOUND');
  await sleep(5500);
  const top=JSON.parse(await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),c=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,120);return [...document.querySelectorAll('button,a,[role="button"],[tabindex]')].filter(v).map((e,i)=>{const r=e.getBoundingClientRect();return {i,text:c(e.innerText||e.textContent),aria:e.getAttribute('aria-label')||'',title:e.getAttribute('title')||'',testid:e.getAttribute('data-testid')||'',y:Math.round(r.y),x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height)};}).filter(x=>x.y<380&&x.w>5&&x.h>5).slice(0,120);})())`)||'[]');
  console.log('TOP_ACTIONS='+JSON.stringify(top));
  let opened=await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const es=[...document.querySelectorAll('button,a,[role="button"],[tabindex]')].filter(v);let e=es.find(x=>/url properties|verify properties|properties/i.test([(x.innerText||x.textContent||''),x.getAttribute('aria-label')||'',x.getAttribute('title')||'',x.getAttribute('data-testid')||''].join(' ')));if(!e)return 0;e.click();return 1;})()`);
  console.log('URL_PROPERTIES_OPENED='+opened);
  if(opened){
    await sleep(1400);
    const st=JSON.parse(await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),c=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,180);const t=(document.body?.innerText||'').split(/\\n+/).map(c).filter(x=>x&&/URL|property|Production|Sandbox|Domain|prefix|Verify|signature|download/i.test(x)).slice(0,120);const ctr=[...document.querySelectorAll('input,button,[role="radio"],[role="button"],[role="combobox"],label')].filter(v).map(e=>({tag:e.tagName,type:e.type||'',text:c(e.innerText||e.textContent),aria:e.getAttribute('aria-label')||'',ph:e.placeholder||'',checked:'checked'in e?!!e.checked:undefined,disabled:!!e.disabled})).slice(0,140);return {t,ctr};})())`)||'{}');
    console.log('VERIFY_HINTS='+JSON.stringify(st.t||[]));
    console.log('VERIFY_CONTROLS='+JSON.stringify(st.ctr||[]));
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{}try{ch.kill('SIGTERM');}catch{}await sleep(300);try{ch.kill('SIGKILL');}catch{}}
