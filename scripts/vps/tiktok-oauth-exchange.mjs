import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const C='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const P=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9265;
const SEC=path.join(os.homedir(),'mmf-secure');
const TOKEN_FILE=path.join(SEC,'tiktok-token.json');
const KEY=process.env.TIKTOK_CLIENT_KEY||'';
const SECRET=process.env.TIKTOK_CLIENT_SECRET||'';
const REDIRECT=process.env.TIKTOK_REDIRECT_URI||'';
const SCOPES=process.env.TIKTOK_SCOPES||'user.info.basic,video.publish';
const sleep=m=>new Promise(r=>setTimeout(r,m));

function fail(msg,code=1){ console.log('STATUS=ERROR'); console.log('ERROR='+msg); process.exitCode=code; }
function saveToken(t){
  fs.mkdirSync(SEC,{recursive:true,mode:0o700}); fs.chmodSync(SEC,0o700);
  const now=Date.now();
  const out={...t,obtained_at:now,access_expires_at:now+(Number(t.expires_in||0)*1000),refresh_expires_at:now+(Number(t.refresh_expires_in||0)*1000)};
  fs.writeFileSync(TOKEN_FILE,JSON.stringify(out,null,2)+'\n',{mode:0o600}); fs.chmodSync(TOKEN_FILE,0o600);
}
async function creatorInfo(access){
  const r=await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json; charset=UTF-8'},body:'{}'});
  let j={}; try{j=await r.json()}catch{}
  const ok=r.ok&&!j?.error?.code;
  const opts=Array.isArray(j?.data?.privacy_level_options)?j.data.privacy_level_options:[];
  console.log('CREATOR_INFO_OK='+Number(ok));
  console.log('PRIVACY_PUBLIC='+Number(opts.includes('PUBLIC_TO_EVERYONE')));
  console.log('PRIVACY_SELF_ONLY='+Number(opts.includes('SELF_ONLY')));
  if(!ok) console.log('CREATOR_INFO_ERROR='+String(j?.error?.code||r.status).replace(/[^A-Za-z0-9_.-]/g,'').slice(0,80));
  return ok;
}

if(!KEY||!SECRET||!REDIRECT){ fail('OAUTH_ENV_MISSING'); process.exit(); }
if(fs.existsSync(TOKEN_FILE)){
  try{
    const t=JSON.parse(fs.readFileSync(TOKEN_FILE,'utf8'));
    if(t.access_token&&Number(t.access_expires_at||0)>Date.now()+120000){
      console.log('TOKEN_PRESENT=1');
      console.log('TOKEN_FILE_MODE='+((fs.statSync(TOKEN_FILE).mode&0o777).toString(8)));
      const ok=await creatorInfo(t.access_token);
      if(ok){ console.log('STATUS=OAUTH_READY'); process.exit(); }
    }
  }catch{}
}

const state=crypto.randomBytes(24).toString('hex');
const auth=new URL('https://www.tiktok.com/v2/auth/authorize/');
auth.searchParams.set('client_key',KEY);
auth.searchParams.set('response_type','code');
auth.searchParams.set('scope',SCOPES);
auth.searchParams.set('redirect_uri',REDIRECT);
auth.searchParams.set('state',state);

const ch=spawn(C,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--user-data-dir=${P}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',auth.toString()],{stdio:['ignore','ignore','ignore']});
let ws,id=0; const q=new Map();
function send(method,params={}){const n=++id;ws.send(JSON.stringify({id:n,method,params}));return new Promise((r,j)=>q.set(n,{r,j}))}
async function ev(expression){const z=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return z?.result?.value}
async function clickOne(names){
  for(const name of names){
    const n=await ev(`(()=>{const q=${JSON.stringify(name)},v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const es=[...document.querySelectorAll('button,a,[role="button"],div,span')].filter(v).filter(e=>(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim()===q&&!e.disabled);if(!es.length)return 0;const e=es.at(-1);(e.closest('button,a,[role="button"]')||e).click();return 1})()`);
    if(n) return name;
  }
  return '';
}

try{
  let page;
  for(let i=0;i<120;i++){
    try{const arr=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();page=arr.find(x=>x.type==='page');if(page?.webSocketDebuggerUrl)break}catch{}
    await sleep(200);
  }
  if(!page) throw Error('CDP_NOT_READY');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const p=q.get(m.id);q.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result)}};
  await send('Runtime.enable');
  let code=''; let returnedState=''; let loginSeen=false; let consentClicked=false;
  for(let i=0;i<180;i++){
    const s=JSON.parse(await ev(`JSON.stringify({host:location.hostname,path:location.pathname,code:new URL(location.href).searchParams.get('code')||'',state:new URL(location.href).searchParams.get('state')||'',error:new URL(location.href).searchParams.get('error')||''})`)||'{}');
    if(s.host==='haiderabode31334.github.io'&&s.code){code=s.code;returnedState=s.state;break}
    if(s.error) throw Error('OAUTH_'+String(s.error).replace(/[^A-Za-z0-9_.-]/g,'').slice(0,60));
    if(/login/i.test(String(s.path||''))) loginSeen=true;
    if(!consentClicked){const b=await clickOne(['Authorize','Allow','Continue','Confirm']);if(b){consentClicked=true;await sleep(1200)}}
    await sleep(500);
  }
  if(!code){
    console.log('LOGIN_REQUIRED='+Number(loginSeen));
    throw Error(loginSeen?'TIKTOK_LOGIN_REQUIRED':'AUTH_CODE_NOT_RECEIVED');
  }
  if(returnedState!==state) throw Error('STATE_MISMATCH');
  const body=new URLSearchParams({client_key:KEY,client_secret:SECRET,code,grant_type:'authorization_code',redirect_uri:REDIRECT});
  const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cache-Control':'no-cache'},body});
  let t={}; try{t=await r.json()}catch{}
  if(!r.ok||!t.access_token||!t.refresh_token){
    const er=String(t.error||t.error_description||r.status).replace(/[^A-Za-z0-9_. -]/g,'').slice(0,120);
    throw Error('TOKEN_EXCHANGE_'+er);
  }
  saveToken(t);
  console.log('TOKEN_STORED=1');
  console.log('TOKEN_FILE_MODE='+((fs.statSync(TOKEN_FILE).mode&0o777).toString(8)));
  console.log('SCOPE_USER_BASIC='+Number(String(t.scope||'').split(',').includes('user.info.basic')));
  console.log('SCOPE_VIDEO_PUBLISH='+Number(String(t.scope||'').split(',').includes('video.publish')));
  const ok=await creatorInfo(t.access_token);
  console.log('STATUS='+(ok?'OAUTH_READY':'TOKEN_READY_CREATOR_INFO_FAILED'));
}catch(e){fail(String(e.message||e).slice(0,160));}
finally{try{ws?.close()}catch{}try{ch.kill('SIGKILL')}catch{}}
