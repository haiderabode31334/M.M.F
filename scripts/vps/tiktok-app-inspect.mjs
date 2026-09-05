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
async function nav(url){await send('Page.navigate',{url});await sleep(6500);}
async function clickText(re){return await evalValue(`(()=>{const r=${re};const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const els=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],div,span')].filter(v);const e=els.find(x=>r.test((x.innerText||x.textContent||'').trim()));if(!e)return '';const c=e.closest('a,button,[role="button"],[role="menuitem"]')||e;c.click();return (c.innerText||c.textContent||'').trim().slice(0,120);})()`);}
async function state(){return JSON.parse(await evalValue(`JSON.stringify({url:location.href,text:(document.body?.innerText||'').slice(0,15000),clicks:[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"]')].filter(e=>e.offsetWidth||e.offsetHeight||e.getClientRects().length).map(e=>({t:(e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120),a:e.getAttribute('aria-label')||'',h:e.href||''})).filter(x=>x.t||x.a).slice(0,250)})`)||'{}');}

try{
  const targets=await waitJson(`http://127.0.0.1:${port}/json`);
  const page=targets.find(t=>t.type==='page'); if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await nav('https://developers.tiktok.com/');
  let s=await state();
  if(/\/login(?:$|[/?#])/i.test(s.url)||/log in with your tiktok developer account/i.test(s.text)){console.log('AUTH=NOT_SAVED');process.exitCode=2;}
  else {
    console.log('AUTH=OK');
    let manage=(s.clicks||[]).find(x=>/manage apps/i.test(x.t));
    if(!manage){
      const profileClick=await evalValue(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const c=[...document.querySelectorAll('button,[role="button"],a')].filter(v);let e=c.find(x=>/profile|account|avatar|developer portal/i.test([x.getAttribute('aria-label'),x.getAttribute('title'),x.textContent].join(' ')));if(!e){e=c.find(x=>x.querySelector('img')&&/avatar|profile/i.test([x.querySelector('img')?.alt,x.getAttribute('aria-label')].join(' ')));}if(!e)return '';e.click();return 'clicked';})()`);
      if(profileClick) await sleep(1500);
      s=await state(); manage=(s.clicks||[]).find(x=>/manage apps/i.test(x.t));
    }
    if(manage){ if(manage.h) await nav(manage.h); else {await clickText('/manage apps/i');await sleep(5000);} }
    else {
      const hints=(s.clicks||[]).filter(x=>/app|portal|profile|account|organization/i.test(x.t+' '+x.a)).map(x=>(x.t||x.a)).filter(Boolean).slice(0,15);
      console.log('MANAGE_APPS_FOUND=0'); console.log('NAV_HINTS='+JSON.stringify(hints)); process.exitCode=3;
    }
    if(!process.exitCode){
      s=await state(); console.log('MANAGE_APPS_FOUND=1');
      const found=s.text.includes(TARGET); console.log('TARGET_FOUND='+(found?1:0));
      if(found){
        const opened=await clickText(`/${TARGET.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/i`); if(opened) await sleep(5000);
        console.log('TARGET_OPENED='+(opened?1:0));
      } else {
        let connect=(s.clicks||[]).find(x=>/connect an app|create an app|create app|add app|new app/i.test(x.t));
        console.log('CONNECT_AVAILABLE='+(connect?1:0));
        if(connect){ if(connect.h) await nav(connect.h); else {await clickText('/connect an app|create an app|create app|add app|new app/i');await sleep(4000);} 
          s=await state();
          const ownerPrompt=/select the app owner|app owner|organization/i.test(s.text); console.log('OWNER_SELECTION='+(ownerPrompt?1:0));
          const options=(s.clicks||[]).filter(x=>/personal|individual|organization|confirm|continue|next/i.test(x.t)).map(x=>x.t).filter(Boolean).slice(0,20);
          console.log('OWNER_HINTS='+JSON.stringify(options));
          if(!ownerPrompt){
            const filled=await evalValue(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const ins=[...document.querySelectorAll('input,textarea')].filter(v);const i=ins.find(x=>/app name|name/i.test([x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' ')))||ins[0];if(!i)return 0;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(i,${JSON.stringify(TARGET)});else i.value=${JSON.stringify(TARGET)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()`);
            console.log('APP_NAME_FILLED='+filled);
          }
        }
      }
    }
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{};try{child.kill('SIGTERM');}catch{};await sleep(500);try{child.kill('SIGKILL');}catch{};}
