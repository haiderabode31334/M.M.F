import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const C='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const P=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9248, APP='M.M.F Publisher', BOX='M.M.F Test';
const sleep=m=>new Promise(r=>setTimeout(r,m));
const ch=spawn(C,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=1440,1200',`--user-data-dir=${P}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}))}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)throw Error('EVAL');return r?.result?.value}
async function ready(){for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return r.json()}catch{}await sleep(250)}throw Error('CDP_NOT_READY')}
async function nav(url,ms=5000){await send('Page.navigate',{url});await sleep(ms)}
async function body(){return String(await ev('document.body?.innerText||""')||'')}
async function openApp(){for(let i=0;i<60;i++){const hit=await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),q=${JSON.stringify(APP)},e=[...document.querySelectorAll('a,button,[role="button"],div,span')].filter(v).find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim()===q);if(!e)return 0;const a=e.closest('a');if(a?.href){location.href=a.href;return 1}(e.closest('button,[role="button"]')||e).click();return 1})()`);if(hit){for(let j=0;j<45;j++){await sleep(300);if(String(await ev('location.pathname')||'').startsWith('/app/'))return 1}}await sleep(250)}return 0}
async function pointFor(label,top=false){return ev(`(()=>{const q=${JSON.stringify(label)},v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),es=[...document.querySelectorAll('*')].filter(v).filter(e=>(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim()===q).map(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,top:r.y,area:r.width*r.height,tag:e.tagName}}).filter(r=>r.area>0&&r.y>=0&&r.y<=innerHeight);if(!es.length)return null;es.sort((a,b)=>${top?'a.top-b.top||a.area-b.area':'a.area-b.area||a.top-b.top'});return es[0]})()`)}
async function mouseClick(label,top=false){const p=await pointFor(label,top);if(!p)return 0;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});return 1}
async function waitClick(label,top=false,tries=40){for(let i=0;i<tries;i++){if(await mouseClick(label,top))return 1;await sleep(300)}return 0}
async function clickDialogProceed(){return ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),ds=[...document.querySelectorAll('[role="dialog"],dialog')].filter(v);for(const d of ds){const bs=[...d.querySelectorAll('button,[role="button"]')].filter(v).filter(b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true');const good=bs.find(b=>/discard|leave|continue|switch|don.?t save|confirm/i.test((b.innerText||b.textContent||'').trim())&&!/cancel|close/i.test((b.innerText||b.textContent||'').trim()));if(good){good.click();return (good.innerText||good.textContent||'').trim().slice(0,80)}}return ''})()`)}
try{
 const tabs=await ready(),p=tabs.find(x=>x.type==='page');ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);r()};ws.onerror=j});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
 await send('Page.enable');await send('Runtime.enable');await nav('https://developers.tiktok.com/apps');if(!await openApp())throw Error('APP_NOT_FOUND');
 const sw=await waitClick('Sandbox',true,50);console.log('SANDBOX_SWITCH='+sw);if(!sw)throw Error('SANDBOX_SWITCH_NOT_READY');await sleep(1800);
 let named=0;for(let i=0;i<35&&!named;i++){if((await body()).includes('You are editing '+BOX)){named=2;break}named=await mouseClick(BOX,false);if(named)break;const p=await clickDialogProceed();if(p){console.log('DIALOG_PROCEED='+JSON.stringify(p));await sleep(900)}else await sleep(350)}
 console.log('NAMED_CLICK='+named);if(named===1)await sleep(2200);
 const txt=await body();console.log('SANDBOX_ACTIVE='+Number(txt.includes('You are editing '+BOX)));console.log('FINAL_HINTS='+JSON.stringify(txt.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x&&/Sandbox|Production|M\.M\.F Test|Apply changes|Products|Scopes|Target users/i.test(x)).slice(0,50)));
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1}finally{try{ws?.close()}catch{}try{ch.kill('SIGTERM')}catch{}await sleep(250);try{ch.kill('SIGKILL')}catch{}}
