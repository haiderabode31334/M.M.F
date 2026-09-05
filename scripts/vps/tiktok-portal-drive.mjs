import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CHROME='/snap/chromium/current/usr/lib/chromium-browser/chrome';
const PROFILE=path.join(os.homedir(),'mmf-browser-profile');
const PORT=9227;
const TARGET='M.M.F Publisher';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const child=spawn(CHROME,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--no-first-run','--no-default-browser-check',
  '--window-size=1440,900',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,
  '--remote-debugging-address=127.0.0.1','--remote-allow-origins=*','about:blank'
],{stdio:['ignore','ignore','ignore']});

async function getTargets(){
  for(let i=0;i<120;i++){
    try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);if(r.ok)return await r.json();}catch{}
    await sleep(250);
  }
  throw new Error('CDP_NOT_READY');
}

let ws,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
async function nav(url,ms=5000){await send('Page.navigate',{url});await sleep(ms);}

async function snap(){
  const raw=await ev(`JSON.stringify((()=>{
    const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
    const body=(document.body?.innerText||'').slice(0,20000);
    const click=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],[tabindex]')].filter(vis).map((e,i)=>{
      const r=e.getBoundingClientRect();
      return {i,t:(e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,140),a:e.getAttribute('aria-label')||'',title:e.getAttribute('title')||'',h:e.href||'',x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),hh:Math.round(r.height),tag:e.tagName};
    }).slice(0,400);
    return {url:location.href,text:body,click};
  })())`);
  return JSON.parse(raw||'{}');
}

async function clickText(patterns){
  const arr=Array.isArray(patterns)?patterns:[patterns];
  const payload=JSON.stringify(arr.map(String));
  return await ev(`(()=>{
    const pats=${payload}.map(s=>new RegExp(s,'i'));
    const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
    const els=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],label,div,span')].filter(vis);
    for(const p of pats){
      let e=els.find(x=>p.test((x.innerText||x.textContent||'').trim()) && (x.innerText||x.textContent||'').trim().length<180);
      if(!e)continue;
      e=e.closest('a,button,[role="button"],[role="menuitem"],label')||e;
      e.click();return 1;
    }
    return 0;
  })()`);
}

async function setInput(labelRe,value){
  return await ev(`(()=>{
    const re=new RegExp(${JSON.stringify(labelRe)},'i');
    const val=${JSON.stringify(value)};
    const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
    const ins=[...document.querySelectorAll('input,textarea')].filter(vis);
    let el=ins.find(i=>re.test([i.name,i.id,i.placeholder,i.getAttribute('aria-label'),i.getAttribute('autocomplete')].join(' ')));
    if(!el){el=ins.find(i=>{let p=i.parentElement;for(let n=0;n<4&&p;n++,p=p.parentElement){if(re.test((p.innerText||'').slice(0,300)))return true;}return false;});}
    if(!el)return 0;
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    el.focus(); if(setter)setter.call(el,val); else el.value=val;
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    return 1;
  })()`);
}

function authBad(s){return /\/login(?:$|[/?#])/i.test(String(s.url||''))||/log in with your tiktok developer account|you need to login/i.test(String(s.text||''));}
function portalish(s){const t=String(s.text||'');return /manage apps|my apps|connect an app|create an app/i.test(t)||t.includes(TARGET);}

async function findManageViaHeader(){
  for(let attempt=0;attempt<14;attempt++){
    await nav('https://developers.tiktok.com/',3500);
    const count=await ev(`(()=>{
      const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
      const W=innerWidth;
      return [...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');}).length;
    })()`);
    if(!count)break;
    if(attempt>=count)break;
    const clicked=await ev(`(()=>{
      const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const W=innerWidth;
      const c=[...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');});
      const e=c[${attempt}];if(!e)return 0;(e.closest('a,button,[role="button"]')||e).click();return 1;
    })()`);
    if(!clicked)continue;
    await sleep(900);
    const s=await snap();
    if(/manage apps|my apps/i.test(s.text||'')){
      const ok=await clickText(['^Manage apps$','^My apps$','Manage apps','My apps']);
      if(ok){await sleep(4500);return true;}
    }
  }
  return false;
}

async function locateApps(){
  const candidates=[
    'https://developers.tiktok.com/apps/',
    'https://developers.tiktok.com/manage-apps/',
    'https://developers.tiktok.com/manage-apps',
    'https://developers.tiktok.com/user/apps',
    'https://developers.tiktok.com/portal/apps'
  ];
  for(const u of candidates){
    await nav(u,4200);const s=await snap();
    if(authBad(s))continue;
    if(portalish(s))return true;
  }
  return await findManageViaHeader();
}

async function chooseOwnerIfNeeded(){
  let s=await snap();
  if(!/app owner|select.*owner|organization|personal|individual/i.test(s.text||''))return false;
  let chosen=await clickText(['^Personal$','^Individual$','Personal account','Individual account']);
  if(!chosen){
    chosen=await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const rs=[...document.querySelectorAll('input[type="radio"], [role="radio"]')].filter(vis);if(rs.length===1){rs[0].click();return 1;}return 0;})()`);
  }
  if(chosen){await sleep(500);await clickText(['^Continue$','^Next$','^Confirm$','^Connect$']);await sleep(2500);}
  return !!chosen;
}

try{
  const targets=await getTargets();const page=targets.find(t=>t.type==='page');if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);resolve();};ws.onerror=reject;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
  await send('Page.enable');await send('Runtime.enable');

  await nav('https://developers.tiktok.com/',4500);
  let s=await snap();
  if(authBad(s)){console.log('AUTH=NOT_SAVED');process.exitCode=2;}
  else{
    console.log('AUTH=OK');
    const located=await locateApps();
    console.log('APPS_AREA_REACHED='+(located?1:0));
    if(!located){process.exitCode=3;}
    else{
      s=await snap();
      let found=String(s.text||'').includes(TARGET);
      console.log('TARGET_FOUND='+(found?1:0));
      if(!found){
        let opened=await clickText(['^Connect an app$','^Create an app$','^Create app$','^Add app$','^New app$','Connect an app','Create an app']);
        console.log('CREATE_FLOW_OPENED='+(opened?1:0));
        if(opened){
          await sleep(2500);
          await chooseOwnerIfNeeded();
          let nameSet=await setInput('app\\s*name|application\\s*name|^name$',TARGET);
          if(!nameSet)nameSet=await setInput('name',TARGET);
          console.log('APP_NAME_FILLED='+(nameSet?1:0));
          if(nameSet){
            const submitted=await clickText(['^Create$','^Connect$','^Continue$','^Next$']);
            console.log('CREATE_SUBMITTED='+(submitted?1:0));
            if(submitted)await sleep(6000);
          }
          s=await snap();
          found=String(s.text||'').includes(TARGET)||/\/app(s)?\//i.test(String(s.url||''))&&!/manage-apps|\/apps\/?$/i.test(String(s.url||''));
          console.log('TARGET_READY='+(found?1:0));
        }
      }else{
        const opened=await clickText([TARGET.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')]);
        if(opened)await sleep(5000);
        console.log('TARGET_OPENED='+(opened?1:0));
      }

      s=await snap();
      const t=String(s.text||'');
      console.log('DETAIL_PATH='+(()=>{try{return new URL(s.url).pathname}catch{return ''}})());
      console.log('HAS_BASIC_INFO='+(/basic information|basic info/i.test(t)?1:0));
      console.log('HAS_PRODUCTS='+(/products|add product/i.test(t)?1:0));
      console.log('HAS_PLATFORMS='+(/platforms|add platform|website url/i.test(t)?1:0));
      console.log('HAS_LOGIN_KIT='+(/login kit/i.test(t)?1:0));
      console.log('HAS_CONTENT_POSTING='+(/content posting api|direct post|upload api/i.test(t)?1:0));
      console.log('HAS_SCOPES='+(/scopes|user\.info\.basic|video\.publish/i.test(t)?1:0));
      console.log('HAS_WEBSITE='+(/website url|website/i.test(t)?1:0));
      console.log('HAS_TERMS='+(/terms of service/i.test(t)?1:0));
      console.log('HAS_PRIVACY='+(/privacy policy/i.test(t)?1:0));
      const safe=(s.click||[]).map(x=>x.t).filter(x=>x&&x.length<90&&/add|configure|manage|edit|save|verify|product|platform|scope|submit|apply/i.test(x)).filter((x,i,a)=>a.indexOf(x)===i).slice(0,30);
      console.log('ACTION_HINTS='+JSON.stringify(safe));
    }
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{
  try{ws?.close();}catch{}
  try{child.kill('SIGTERM');}catch{}
  await sleep(400);try{child.kill('SIGKILL');}catch{}
}
