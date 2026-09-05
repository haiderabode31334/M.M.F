import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const chrome='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const profile=path.join(os.homedir(),'mmf-browser-profile');
const port=9225;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TARGET='M.M.F Publisher';
const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--no-first-run','--no-default-browser-check',
  `--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,
  '--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'
],{stdio:['ignore','ignore','ignore']});

async function waitJson(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return await r.json();}catch{} await sleep(250);}throw new Error('CDP_NOT_READY');}
let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function evalValue(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function nav(url){await send('Page.navigate',{url});await sleep(7000);}

try{
  const targets=await waitJson(`http://127.0.0.1:${port}/json`);
  const page=targets.find(t=>t.type==='page');
  if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await nav('https://developers.tiktok.com/apps/');
  const state=JSON.parse(await evalValue(`JSON.stringify({
    url:location.href,
    text:(document.body?.innerText||'').slice(0,12000),
    links:[...document.querySelectorAll('a')].map(a=>({t:(a.innerText||a.textContent||'').trim().slice(0,200),h:a.href})).filter(x=>x.h.includes('developers.tiktok.com'))
  })`)||'{}');
  const text=String(state.text||''); const url=String(state.url||'');
  if(/\/login(?:$|[/?#])/i.test(url)||/need to login|log in with your tiktok developer account/i.test(text)){
    console.log('AUTH=NOT_SAVED'); process.exitCode=2;
  }else{
    console.log('AUTH=OK');
    const found=text.includes(TARGET);
    console.log('TARGET_FOUND='+(found?1:0));
    const create=/create an app|create app|add app|new app/i.test(text);
    console.log('CREATE_AVAILABLE='+(create?1:0));
    let href='';
    const exact=(state.links||[]).find(x=>x.t===TARGET);
    const partial=(state.links||[]).find(x=>x.t.includes(TARGET));
    href=(exact||partial||{}).h||'';
    if(found && !href){
      href=await evalValue(`(()=>{const wanted=${JSON.stringify(TARGET)};const els=[...document.querySelectorAll('a,button,[role="button"],div')];const e=els.find(x=>(x.innerText||x.textContent||'').trim()===wanted)||els.find(x=>(x.innerText||x.textContent||'').includes(wanted));if(!e)return '';const a=e.closest('a')||e.querySelector?.('a');return a?.href||'';})()`);
    }
    if(href){
      await nav(href);
      const d=JSON.parse(await evalValue(`JSON.stringify({url:location.href,text:(document.body?.innerText||'').slice(0,12000),buttons:[...document.querySelectorAll('button,[role="button"]')].map(b=>(b.innerText||b.textContent||'').trim()).filter(Boolean).slice(0,80),labels:[...document.querySelectorAll('label')].map(l=>(l.innerText||l.textContent||'').trim()).filter(Boolean).slice(0,80),inputs:[...document.querySelectorAll('input,textarea,select')].map(i=>({type:i.type||i.tagName,ph:i.placeholder||'',name:i.name||'',id:i.id||''})).slice(0,100)})`)||'{}');
      const dt=String(d.text||'');
      console.log('DETAIL_REACHED=1');
      console.log('HAS_BASIC_INFO='+( /basic information|basic info/i.test(dt)?1:0));
      console.log('HAS_LOGIN_KIT='+( /login kit/i.test(dt)?1:0));
      console.log('HAS_CONTENT_POSTING='+( /content posting api|direct post|upload api/i.test(dt)?1:0));
      console.log('HAS_WEB_PLATFORM='+( /web|website url/i.test(dt)?1:0));
      console.log('HAS_TERMS='+( /terms of service/i.test(dt)?1:0));
      console.log('HAS_PRIVACY='+( /privacy policy/i.test(dt)?1:0));
      const safeButtons=(d.buttons||[]).filter(x=>x.length<=80 && /edit|add|save|submit|apply|configure|manage|verify|product|platform|scope/i.test(x)).slice(0,25);
      const safeLabels=(d.labels||[]).filter(x=>x.length<=100).slice(0,25);
      console.log('BUTTON_HINTS='+JSON.stringify(safeButtons));
      console.log('LABEL_HINTS='+JSON.stringify(safeLabels));
    }else{
      console.log('DETAIL_REACHED=0');
    }
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{};try{child.kill('SIGTERM');}catch{};await sleep(500);try{child.kill('SIGKILL');}catch{};}
