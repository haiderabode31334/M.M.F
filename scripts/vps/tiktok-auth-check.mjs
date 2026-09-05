import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const chrome='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const profile=path.join(os.homedir(),'mmf-browser-profile');
const port=9224;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--no-first-run','--no-default-browser-check',
  `--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,
  '--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'
],{stdio:['ignore','ignore','ignore']});

async function waitJson(url){
  for(let i=0;i<80;i++){
    try{const r=await fetch(url);if(r.ok)return await r.json();}catch{}
    await sleep(250);
  }
  throw new Error('CDP not ready');
}

let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function evalValue(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}

try{
  const targets=await waitJson(`http://127.0.0.1:${port}/json`);
  const page=targets.find(t=>t.type==='page');
  if(!page?.webSocketDebuggerUrl)throw new Error('No page target');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WS timeout')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'https://developers.tiktok.com/apps/'});
  await sleep(7000);
  const raw=await evalValue(`JSON.stringify({url:location.href,text:(document.body?.innerText||'').slice(0,5000)})`);
  const s=JSON.parse(raw||'{}');
  const text=String(s.text||'');
  const url=String(s.url||'');
  const needsLogin=/need to login|log in with your tiktok developer account|don't have a developer account|forgot password/i.test(text)||/\/login(?:$|[/?#])/i.test(url);
  const denied=/no access/i.test(text)&&/login/i.test(text);
  if(needsLogin||denied){
    console.log('TIKTOK_AUTH=NOT_SAVED');
    process.exitCode=2;
  }else{
    console.log('TIKTOK_AUTH=OK');
    console.log('TIKTOK_APPS_PAGE=REACHED');
  }
}finally{
  try{ws?.close();}catch{}
  try{child.kill('SIGTERM');}catch{}
  await sleep(500);
  try{child.kill('SIGKILL');}catch{}
}
