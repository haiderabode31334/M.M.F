import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CHROME='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const PROFILE=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9228;
const TARGET='M.M.F Publisher';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const child=spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});

async function targets(){for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return await r.json();}catch{}await sleep(250);}throw new Error('CDP_NOT_READY');}
let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function nav(url,ms=4200){await send('Page.navigate',{url});await sleep(ms);}
async function body(){return String(await ev('(document.body?.innerText||"").slice(0,18000)')||'');}
async function clickText(patterns){const p=JSON.stringify((Array.isArray(patterns)?patterns:[patterns]).map(String));return await ev(`(()=>{const ps=${p}.map(s=>new RegExp(s,'i'));const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const els=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],label,div,span')].filter(vis);for(const re of ps){let e=els.find(x=>re.test((x.innerText||x.textContent||'').trim())&&(x.innerText||x.textContent||'').trim().length<180);if(!e)continue;e=e.closest('a,button,[role="button"],[role="menuitem"],label')||e;e.click();return 1;}return 0;})()`);}
async function tryCreate(){const ok=await clickText(['^Connect an app$','^Create an app$','^Create app$','^Add app$','^New app$','Connect an app','Create an app']);if(ok){await sleep(2200);return true;}return false;}
async function setName(){return await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const ins=[...document.querySelectorAll('input,textarea')].filter(vis);let i=ins.find(x=>/app\\s*name|application\\s*name|^name$/i.test([x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' ')))||ins[0];if(!i)return 0;const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;i.focus();if(setter)setter.call(i,${JSON.stringify(TARGET)});else i.value=${JSON.stringify(TARGET)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()`);}
async function openCreateFlow(){
  const routes=['https://developers.tiktok.com/apps/','https://developers.tiktok.com/manage-apps/','https://developers.tiktok.com/manage-apps','https://developers.tiktok.com/user/apps','https://developers.tiktok.com/portal/apps'];
  for(let cycle=0;cycle<3;cycle++){
    for(const u of routes){await nav(u);if(await tryCreate())return true;}
    for(let attempt=0;attempt<14;attempt++){
      await nav('https://developers.tiktok.com/',3000);
      const count=Number(await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const W=innerWidth;return [...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');}).length;})()` )||0);
      if(attempt>=count)break;
      await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const W=innerWidth;const c=[...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');});const e=c[${attempt}];if(!e)return 0;(e.closest('a,button,[role="button"]')||e).click();return 1;})()`);
      await sleep(800);
      if(/manage apps|my apps/i.test(await body())){const m=await clickText(['^Manage apps$','^My apps$','Manage apps','My apps']);if(m){await sleep(3500);if(await tryCreate())return true;}}
    }
  }
  return false;
}

try{
  const ts=await targets();const page=ts.find(t=>t.type==='page');if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);res();};ws.onerror=rej;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};await send('Page.enable');await send('Runtime.enable');
  await nav('https://developers.tiktok.com/');
  if(/log in with your tiktok developer account/i.test(await body())){console.log('AUTH=NOT_SAVED');process.exitCode=2;}
  else{
    console.log('AUTH=OK');const opened=await openCreateFlow();console.log('CREATE_FLOW_OPENED='+(opened?1:0));
    if(opened){const filled=await setName();console.log('APP_NAME_FILLED='+(filled?1:0));await sleep(700);
      const raw=await ev(`JSON.stringify((()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const root=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(vis)||document.body;const all=[...root.querySelectorAll('button,[role="button"],a')].filter(vis).map(e=>({t:(e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,90),a:(e.getAttribute('aria-label')||'').slice(0,90),title:(e.getAttribute('title')||'').slice(0,90),disabled:!!(e.disabled||e.getAttribute('aria-disabled')==='true')}));const btn=all.filter(x=>/create|connect|confirm|continue|next|submit|save|done|cancel|back|close|accept|agree/i.test([x.t,x.a,x.title].join(' '))).slice(0,30);const inputs=[...root.querySelectorAll('input,textarea,select')].filter(vis);const generic=(root.innerText||'').split(/\\n+/).map(s=>s.trim()).filter(s=>s&&s.length<120&&/app owner|personal|individual|organization|app name|terms|agree|accept|required|create|connect|continue|confirm|submit/i.test(s)).slice(0,40);return {buttons:btn,checkboxes:inputs.filter(i=>i.type==='checkbox').length,radios:inputs.filter(i=>i.type==='radio').length,selects:inputs.filter(i=>i.tagName==='SELECT').length,generic};})())`);
      const d=JSON.parse(raw||'{}');console.log('CREATE_BUTTONS='+JSON.stringify(d.buttons||[]));console.log('CHECKBOX_COUNT='+(d.checkboxes||0));console.log('RADIO_COUNT='+(d.radios||0));console.log('SELECT_COUNT='+(d.selects||0));console.log('GENERIC_HINTS='+JSON.stringify(d.generic||[]));
    }
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{}try{child.kill('SIGTERM');}catch{}await sleep(300);try{child.kill('SIGKILL');}catch{}}
