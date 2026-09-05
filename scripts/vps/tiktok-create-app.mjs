import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CHROME='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const PROFILE=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9231;
const APP_NAME='M.M.F Publisher';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const child=spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function ready(){for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return await r.json();}catch{}await sleep(250);}throw new Error('CDP_NOT_READY');}
async function nav(u,ms=5000){await send('Page.navigate',{url:u});await sleep(ms);}
async function text(){return String(await ev(`document.body?.innerText||''`));}
async function clickText(s){return await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const q=${JSON.stringify(s)};let e=[...document.querySelectorAll('button,a,[role="button"],label,div,span')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()===q);if(!e)return 0;(e.closest('button,a,[role="button"],label')||e).click();return 1})()`);}
async function pointForLabel(labelText){const raw=await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const q=${JSON.stringify(labelText)};const labels=[...document.querySelectorAll('label')].filter(v);let e=labels.find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim().startsWith(q));if(!e){const n=[...document.querySelectorAll('div,span,p')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()===q);e=n?.closest('label')||n;}if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);return JSON.parse(raw||'null');}
async function mouseClick(p){if(!p)return 0;for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x:p.x,y:p.y,button:'left',clickCount:1});return 1;}
async function radioChecked(labelText){return !!await ev(`(()=>{const q=${JSON.stringify(labelText)};const labels=[...document.querySelectorAll('label')];const l=labels.find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim().startsWith(q));const r=l?.querySelector('input[type="radio"]');return !!r?.checked})()`);}
async function trySelectIndividual(){
  for(let i=0;i<5;i++){
    const p=await pointForLabel('Individual');
    if(p)await mouseClick(p);
    await sleep(500);
    if(await radioChecked('Individual'))return 1;
    const js=await ev(`(()=>{const labels=[...document.querySelectorAll('label')];const l=labels.find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim().startsWith('Individual'));if(!l)return 0;l.click();return 1})()`);
    await sleep(500);if(await radioChecked('Individual'))return 1;
    const kb=await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim().startsWith('Individual'));const r=l?.querySelector('input[type="radio"]');if(!r)return 0;r.focus();return 1})()`);
    if(kb){await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});}
    await sleep(500);if(await radioChecked('Individual'))return 1;
  }
  return 0;
}
async function buttonEnabled(name){return !!await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const b=[...document.querySelectorAll('button,[role="button"]')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()===${JSON.stringify(name)});return !!b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'})()`);}
async function clickButton(name){const p=JSON.parse(await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const b=[...document.querySelectorAll('button,[role="button"]')].filter(v).find(x=>(x.innerText||x.textContent||'').trim()===${JSON.stringify(name)}&&!x.disabled&&x.getAttribute('aria-disabled')!=='true');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`)||'null');return mouseClick(p);}
async function waitFor(sel,loops=80){for(let i=0;i<loops;i++){if(await ev(`!!document.querySelector(${JSON.stringify(sel)})`))return 1;await sleep(500);}return 0;}
async function fillName(){const ok=await ev(`(()=>{const e=document.querySelector('#appName');if(!e)return 0;e.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;set?set.call(e,''):e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);if(!ok)return 0;await send('Input.insertText',{text:APP_NAME});await sleep(800);return 1;}
async function selectAppType(){const raw=await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const rs=[...document.querySelectorAll('input[type="radio"]')].filter(v);return rs.map((r,i)=>{const q=r.getBoundingClientRect();let l=r.closest('label');const t=(l?.innerText||l?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,100);const rr=l?.getBoundingClientRect?.()||q;return {i,checked:!!r.checked,text:t,x:rr.x+rr.width/2,y:rr.y+rr.height/2};})})())`);const rs=JSON.parse(raw||'[]');console.log('APP_TYPE_COUNT='+rs.length);if(rs.some(r=>r.checked))return 1;if(rs.length===1){await mouseClick(rs[0]);await sleep(700);return !!(await ev(`[...document.querySelectorAll('input[type="radio"]')].some(r=>r.checked)`));}return 0;}
async function inspect(){const raw=await ev(`JSON.stringify((()=>{const t=document.body?.innerText||'';const safe=t.split(/\\n+/).map(s=>s.replace(/\\s+/g,' ').trim()).filter(x=>x&&/Basic information|Category|Description|Products|Platforms|Terms of Service|Privacy Policy|Login Kit|Content Posting|Scopes|Website|Submit for review|Draft/i.test(x)).slice(0,60);return {path:location.pathname,found:t.includes(${JSON.stringify(APP_NAME)}),hints:safe};})())`);return JSON.parse(raw||'{}');}

try{
  const targets=await ready();const page=targets.find(x=>x.type==='page');if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);res();};ws.onerror=rej;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable');await send('Runtime.enable');await nav('https://developers.tiktok.com/apps');
  const body=await text();if(/log in with your tiktok developer account/i.test(body)){console.log('AUTH=NOT_SAVED');process.exitCode=2;}
  else if(body.includes(APP_NAME)){console.log('AUTH=OK');console.log('APP_ALREADY_EXISTS=1');const opened=await clickText(APP_NAME);if(opened)await sleep(5000);const s=await inspect();console.log('APP_READY=1');console.log('DETAIL_PATH='+String(s.path||'').replace(/[A-Za-z0-9_-]{12,}/g,'<id>'));console.log('DETAIL_HINTS='+JSON.stringify(s.hints||[]));}
  else{
    console.log('AUTH=OK');const opened=await clickText('Connect an app');console.log('CONNECT_OPENED='+opened);if(!opened)throw new Error('CONNECT_NOT_FOUND');await sleep(1200);
    const selected=await trySelectIndividual();console.log('INDIVIDUAL_SELECTED='+selected);if(!selected)throw new Error('INDIVIDUAL_NOT_SELECTED');
    for(let i=0;i<10&&!await buttonEnabled('Confirm');i++)await sleep(300);
    const confirmed=await clickButton('Confirm');console.log('OWNER_CONFIRMED='+confirmed);if(!confirmed)throw new Error('OWNER_CONFIRM_NOT_READY');
    const form=await waitFor('#appName',100);console.log('APP_FORM_READY='+form);if(!form)throw new Error('APP_FORM_TIMEOUT');
    const named=await fillName();console.log('APP_NAME_FILLED='+named);if(!named)throw new Error('APP_NAME_FAILED');
    const type=await selectAppType();console.log('APP_TYPE_SELECTED='+type);
    for(let i=0;i<12&&!await buttonEnabled('Create app');i++)await sleep(300);
    console.log('CREATE_ENABLED='+Number(await buttonEnabled('Create app')));
    const created=await clickButton('Create app');console.log('CREATE_CLICKED='+created);if(!created)throw new Error('CREATE_NOT_READY');
    await sleep(9000);const s=await inspect();console.log('APP_READY='+Number(!!s.found||!/^\/apps\/?$/.test(String(s.path||''))));console.log('DETAIL_PATH='+String(s.path||'').replace(/[A-Za-z0-9_-]{12,}/g,'<id>'));console.log('DETAIL_HINTS='+JSON.stringify(s.hints||[]));
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}finally{try{ws?.close();}catch{}try{child.kill('SIGTERM');}catch{}await sleep(300);try{child.kill('SIGKILL');}catch{}}
