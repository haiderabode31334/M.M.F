import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

const C='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const P=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9266;
const SEC=path.join(os.homedir(),'mmf-secure');
const TOKEN_FILE=path.join(SEC,'tiktok-token.json');
const KEY=process.env.TIKTOK_CLIENT_KEY||'';
const SECRET=process.env.TIKTOK_CLIENT_SECRET||'';
const REDIRECT=process.env.TIKTOK_REDIRECT_URI||'';
const SCOPES=process.env.TIKTOK_SCOPES||'user.info.basic,video.publish';
const cred=process.argv[2];
const sleep=m=>new Promise(r=>setTimeout(r,m));
if(!KEY||!SECRET||!REDIRECT) throw Error('OAUTH_ENV_MISSING');
if(!cred) throw Error('CREDENTIAL_FILE_REQUIRED');
const [LOGIN,PASS]=fs.readFileSync(cred,'utf8').split(/\n/); try{fs.unlinkSync(cred)}catch{}
if(!LOGIN||!PASS) throw Error('CREDENTIALS_MISSING');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});

const state=crypto.randomBytes(24).toString('hex');
const auth=new URL('https://www.tiktok.com/v2/auth/authorize/');
auth.searchParams.set('client_key',KEY);auth.searchParams.set('response_type','code');auth.searchParams.set('scope',SCOPES);auth.searchParams.set('redirect_uri',REDIRECT);auth.searchParams.set('state',state);

const ch=spawn(C,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--user-data-dir=${P}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',auth.toString()],{stdio:['ignore','ignore','ignore']});
let ws,id=0;const q=new Map();
function send(method,params={}){const n=++id;ws.send(JSON.stringify({id:n,method,params}));return new Promise((r,j)=>q.set(n,{r,j}))}
async function ev(expression){const z=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return z?.result?.value}
async function txt(){return String(await ev('document.body?.innerText||""')||'')}
async function click(name){return ev(`(()=>{const q=${JSON.stringify(name)},v=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const es=[...document.querySelectorAll('button,a,[role="button"],div,span')].filter(v).filter(e=>(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim()===q&&!e.disabled);if(!es.length)return 0;const e=es.at(-1);(e.closest('button,a,[role="button"]')||e).click();return 1})()`)}
async function setInput(index,val){return ev(`(()=>{const es=[...document.querySelectorAll('input')].filter(e=>e.offsetWidth||e.offsetHeight),e=es[${index}],v=${JSON.stringify(val)};if(!e)return 0;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;e.focus();s?s.call(e,v):e.value=v;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`)}
async function inputs(){return JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('input')].filter(e=>e.offsetWidth||e.offsetHeight).map((e,i)=>({i,type:e.type||'',ph:e.placeholder||''})))`)||'[]')}
async function loc(){return JSON.parse(await ev(`JSON.stringify({host:location.hostname,path:location.pathname,code:new URL(location.href).searchParams.get('code')||'',state:new URL(location.href).searchParams.get('state')||'',error:new URL(location.href).searchParams.get('error')||''})`)||'{}')}
async function creatorInfo(access){const r=await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json; charset=UTF-8'},body:'{}'});let j={};try{j=await r.json()}catch{};const opts=Array.isArray(j?.data?.privacy_level_options)?j.data.privacy_level_options:[];const ok=r.ok&&!j?.error?.code;console.log('CREATOR_INFO_OK='+Number(ok));console.log('PRIVACY_PUBLIC='+Number(opts.includes('PUBLIC_TO_EVERYONE')));console.log('PRIVACY_SELF_ONLY='+Number(opts.includes('SELF_ONLY')));return ok}
function saveToken(t){fs.mkdirSync(SEC,{recursive:true,mode:0o700});fs.chmodSync(SEC,0o700);const now=Date.now(),out={...t,obtained_at:now,access_expires_at:now+Number(t.expires_in||0)*1000,refresh_expires_at:now+Number(t.refresh_expires_in||0)*1000};fs.writeFileSync(TOKEN_FILE,JSON.stringify(out,null,2)+'\n',{mode:0o600});fs.chmodSync(TOKEN_FILE,0o600)}

try{
 let page;for(let i=0;i<120;i++){try{const a=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();page=a.find(x=>x.type==='page');if(page?.webSocketDebuggerUrl)break}catch{}await sleep(200)}if(!page)throw Error('CDP_NOT_READY');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const p=q.get(m.id);q.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result)}};await send('Runtime.enable');await sleep(4500);
 let L=await loc();
 if(/login/i.test(L.path||'')){
   if(!await click('Use phone / email / username'))throw Error('LOGIN_METHOD_NOT_FOUND');await sleep(900);
   await click('Log in with email or username');await click('Email / Username');await sleep(700);
   let ins=await inputs(),pass=ins.find(x=>x.type==='password'),user=ins.find(x=>x.i!==pass?.i&&(x.type==='text'||x.type==='email'||x.type===''));
   if(!user||!pass){await click('Log in with email or username');await sleep(700);ins=await inputs();pass=ins.find(x=>x.type==='password');user=ins.find(x=>x.i!==pass?.i&&(x.type==='text'||x.type==='email'||x.type===''))}
   if(!user||!pass)throw Error('LOGIN_FIELDS_NOT_FOUND');await setInput(user.i,LOGIN);await setInput(pass.i,PASS);console.log('CREDENTIALS_FILLED=1');if(!await click('Log in'))throw Error('LOGIN_BUTTON_NOT_FOUND');await sleep(5000);
   let body=(await txt()).toLowerCase();if(/captcha|verify you are human|security verification/.test(body)){console.log('STATUS=CAPTCHA_REQUIRED');process.exitCode=2;throw Error('CAPTCHA_REQUIRED')}
   if(/verification code|enter code|6-digit|code was sent|enter the code/.test(body)){const code=(await rl.question('TikTok verification code: ')).trim();const vis=await inputs();const ci=vis.find(x=>x.type==='text'||x.type==='tel'||x.type==='number');if(!ci||!code)throw Error('VERIFICATION_CODE_REQUIRED');await setInput(ci.i,code);for(const b of['Confirm','Next','Continue','Submit','Log in'])if(await click(b))break;await sleep(4500)}
 }
 let code='',retState='';
 for(let i=0;i<120;i++){
   L=await loc();if(L.host==='haiderabode31334.github.io'&&L.code){code=L.code;retState=L.state;break}if(L.error)throw Error('OAUTH_'+String(L.error).replace(/[^A-Za-z0-9_.-]/g,''));
   const body=(await txt()).toLowerCase();if(/developer terms/.test(body)&&/agree|accept/.test(body)){console.log('STATUS=TERMS_CONFIRMATION_REQUIRED');process.exitCode=4;throw Error('TERMS_CONFIRMATION_REQUIRED')}
   for(const b of['Authorize','Allow','Continue','Confirm']){if(await click(b)){await sleep(1000);break}}
   if(i===30&&!/login/i.test(L.path||'')){await send('Page.navigate',{url:auth.toString()});await sleep(1800)}
   await sleep(500);
 }
 if(!code)throw Error('AUTH_CODE_NOT_RECEIVED');if(retState!==state)throw Error('STATE_MISMATCH');
 const body=new URLSearchParams({client_key:KEY,client_secret:SECRET,code,grant_type:'authorization_code',redirect_uri:REDIRECT});const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cache-Control':'no-cache'},body});let t={};try{t=await r.json()}catch{};if(!r.ok||!t.access_token||!t.refresh_token)throw Error('TOKEN_EXCHANGE_'+String(t.error||t.error_description||r.status).replace(/[^A-Za-z0-9_. -]/g,'').slice(0,100));
 saveToken(t);console.log('TOKEN_STORED=1');console.log('TOKEN_FILE_MODE='+((fs.statSync(TOKEN_FILE).mode&0o777).toString(8)));console.log('SCOPE_USER_BASIC='+Number(String(t.scope||'').split(',').includes('user.info.basic')));console.log('SCOPE_VIDEO_PUBLISH='+Number(String(t.scope||'').split(',').includes('video.publish')));const ok=await creatorInfo(t.access_token);console.log('STATUS='+(ok?'OAUTH_READY':'TOKEN_READY_CREATOR_INFO_FAILED'));
}catch(e){if(!process.exitCode){console.log('STATUS=ERROR');console.log('ERROR='+String(e.message||e).slice(0,140));process.exitCode=1}}
finally{try{rl.close()}catch{}try{ws?.close()}catch{}try{ch.kill('SIGKILL')}catch{}}
