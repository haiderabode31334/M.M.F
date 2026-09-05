import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const C='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const P=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9238;
const APP='M.M.F Publisher';
const PREFIX='https://haiderabode31334.github.io/M.M.F/';
const DL='/tmp/mmf-tiktok-verify-downloads';
const sleep=m=>new Promise(r=>setTimeout(r,m));
fs.rmSync(DL,{recursive:true,force:true});fs.mkdirSync(DL,{recursive:true});
const ch=spawn(C,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=1440,1000',`--user-data-dir=${P}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'],{stdio:['ignore','ignore','ignore']});
let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function ready(){for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return r.json();}catch{}await sleep(250);}throw Error('CDP_NOT_READY');}
async function nav(url,ms=6000){await send('Page.navigate',{url});await sleep(ms);}
async function clickButton(text){return ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),q=${JSON.stringify(text)};const e=[...document.querySelectorAll('button,a,[role="button"]')].filter(v).find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim()===q);if(!e)return 0;e.click();return 1})()`);}
async function clickExact(text){return ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),q=${JSON.stringify(text)};let e=[...document.querySelectorAll('a,button,[role="button"],label,div,span')].filter(v).find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim()===q);if(!e)return 0;(e.closest('a,button,[role="button"],label')||e).click();return 1})()`);}
async function openApp(){for(let i=0;i<20;i++){if(await clickExact(APP))return 1;await sleep(400);}const f=await ev(`(()=>{const e=[...document.querySelectorAll('input')].find(x=>/search by name/i.test(x.placeholder||''));if(!e)return 0;e.focus();return 1})()`);if(f){await send('Input.insertText',{text:APP});await sleep(1500);for(let i=0;i<15;i++){if(await clickExact(APP))return 1;await sleep(400);}}return 0;}
async function closeSupport(){const n=await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const b=[...document.querySelectorAll('button')].filter(v).find(e=>(e.getAttribute('aria-label')||'')==='Close');if(!b)return 0;b.click();return 1})()`);if(n)await sleep(500);return n;}
async function selectPrefix(){return ev(`(()=>{const labels=[...document.querySelectorAll('label')];const l=labels.find(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim()==='URL prefix');if(!l)return 0;l.click();return 1})()`);}
async function visibleTextInputs(){const raw=await ev(`JSON.stringify((()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),c=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,180);return [...document.querySelectorAll('input[type="text"],input[type="url"],input:not([type])')].filter(v).map((e,i)=>({i,ph:e.placeholder||'',name:e.name||'',id:e.id||'',aria:e.getAttribute('aria-label')||'',near:(()=>{let p=e.parentElement;for(let j=0;j<4&&p;j++,p=p.parentElement){const t=c(p.innerText);if(t&&t.length<260)return t;}return ''})()}));})())`);return JSON.parse(raw||'[]');}
async function fillPrefix(){const ok=await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const es=[...document.querySelectorAll('input[type="text"],input[type="url"],input:not([type])')].filter(v);const e=es.find(x=>/url|prefix|property|https/i.test([x.placeholder,x.name,x.id,x.getAttribute('aria-label')||''].join(' ')))||es[es.length-1];if(!e)return 0;e.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;set?set.call(e,''):e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);if(!ok)return 0;await send('Input.insertText',{text:PREFIX});await sleep(700);return 1;}
async function waitForButton(name,loops=30){for(let i=0;i<loops;i++){if(await ev(`(()=>{const v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length)),q=${JSON.stringify(name)};return [...document.querySelectorAll('button,a,[role="button"]')].filter(v).some(x=>(x.innerText||x.textContent||'').replace(/\\s+/g,' ').trim()===q)})()`))return 1;await sleep(350);}return 0;}
async function downloadInfo(){for(let i=0;i<30;i++){const files=fs.readdirSync(DL).filter(x=>!x.endsWith('.crdownload'));if(files.length){const name=files[0],buf=fs.readFileSync(path.join(DL,name));return {name,content:buf.toString('utf8').trim(),size:buf.length};}await sleep(350);}return null;}

try{
 const ts=await ready(),p=ts.find(x=>x.type==='page');if(!p?.webSocketDebuggerUrl)throw Error('NO_PAGE');
 ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 await send('Page.enable');await send('Runtime.enable');await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL,eventsEnabled:true});
 await nav('https://developers.tiktok.com/apps');if(!await openApp())throw Error('APP_NOT_FOUND');await sleep(5000);await closeSupport();
 if(!await clickButton('URL properties'))throw Error('URL_PROPERTIES_NOT_FOUND');await sleep(500);if(!await clickButton('Verify properties'))throw Error('VERIFY_PROPERTIES_NOT_FOUND');await sleep(600);
 console.log('URL_PREFIX_CLICKED='+await selectPrefix());await sleep(700);
 console.log('PREFIX_INPUTS='+JSON.stringify(await visibleTextInputs()));
 const filled=await fillPrefix();console.log('PREFIX_FILLED='+filled);if(!filled)throw Error('PREFIX_INPUT_NOT_FOUND');
 console.log('VERIFY_BUTTON_READY='+await waitForButton('Verify',20));const verify=await clickButton('Verify');console.log('VERIFY_CLICKED='+verify);if(!verify)throw Error('VERIFY_BUTTON_NOT_FOUND');
 await sleep(1200);
 const hints=JSON.parse(await ev(`JSON.stringify((document.body?.innerText||'').split(/\\n+/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(x=>x&&/signature|download|upload|file|verified|verify|URL prefix/i.test(x)).slice(0,80))`)||'[]');console.log('POST_VERIFY_HINTS='+JSON.stringify(hints));
 const hasDownload=await waitForButton('Download',10);console.log('DOWNLOAD_READY='+hasDownload);if(hasDownload){console.log('DOWNLOAD_CLICKED='+await clickButton('Download'));const info=await downloadInfo();if(info){console.log('SIGNATURE_FILENAME='+info.name.replace(/[^A-Za-z0-9._=-]/g,'_'));console.log('SIGNATURE_SIZE='+info.size);console.log('SIGNATURE_CONTENT='+info.content.replace(/[\r\n]+/g,''));}else console.log('SIGNATURE_DOWNLOAD=NOT_FOUND');}
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{}try{ch.kill('SIGTERM');}catch{}await sleep(300);try{ch.kill('SIGKILL');}catch{}}
