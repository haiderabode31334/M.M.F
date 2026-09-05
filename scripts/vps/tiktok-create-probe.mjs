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
async function body(){return String(await ev('(document.body?.innerText||"").slice(0,20000)')||'');}
async function clickText(patterns){const p=JSON.stringify((Array.isArray(patterns)?patterns:[patterns]).map(String));return await ev(`(()=>{const ps=${p}.map(s=>new RegExp(s,'i'));const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const els=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],label,div,span')].filter(vis);for(const re of ps){let e=els.find(x=>re.test((x.innerText||x.textContent||'').trim())&&(x.innerText||x.textContent||'').trim().length<180);if(!e)continue;e=e.closest('a,button,[role="button"],[role="menuitem"],label')||e;e.click();return 1;}return 0;})()`);}
async function tryConnect(){const ok=await clickText(['^Connect an app$','^Create an app$','^Create app$','^Add app$','^New app$','Connect an app','Create an app']);if(ok){await sleep(2200);return true;}return false;}
async function openConnectFlow(){
  for(let cycle=0;cycle<3;cycle++){
    for(const u of ['https://developers.tiktok.com/apps/','https://developers.tiktok.com/manage-apps/','https://developers.tiktok.com/manage-apps','https://developers.tiktok.com/user/apps','https://developers.tiktok.com/portal/apps']){await nav(u);if(await tryConnect())return true;}
    for(let attempt=0;attempt<14;attempt++){
      await nav('https://developers.tiktok.com/',3000);
      const count=Number(await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const W=innerWidth;return [...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');}).length;})()` )||0);
      if(attempt>=count)break;
      await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const W=innerWidth;const c=[...document.querySelectorAll('header *,nav *')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();if(r.y>180||r.x<W*.45||r.width<8||r.height<8||r.width>180||r.height>140)return false;return e.matches('a,button,[role="button"],[tabindex]')||e.querySelector('img,svg');});const e=c[${attempt}];if(!e)return 0;(e.closest('a,button,[role="button"]')||e).click();return 1;})()`);
      await sleep(800);
      if(/manage apps|my apps/i.test(await body())){const m=await clickText(['^Manage apps$','^My apps$','Manage apps','My apps']);if(m){await sleep(3500);if(await tryConnect())return true;}}
    }
  }
  return false;
}
async function chooseOwner(){
  const legal=await ev(`(()=>{const root=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(e=>e.offsetWidth||e.offsetHeight||e.getClientRects().length)||document.body;return /terms of service|I agree|accept terms/i.test(root.innerText||'')&&!!root.querySelector('input[type="checkbox"]');})()`);
  if(legal)return {status:'LEGAL_CONFIRMATION_REQUIRED',count:0};
  let generic=await clickText(['^Individual$','^Personal$','Individual account','Personal account','Developer account','My account']);
  if(generic){await sleep(700);return {status:'GENERIC_SELECTED',count:1};}
  const info=JSON.parse(await ev(`JSON.stringify((()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const root=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(vis)||document.body;const all=[...root.querySelectorAll('[role="option"],[role="radio"],button,a,[tabindex],div')].filter(e=>{if(!vis(e)||e===root)return false;const r=e.getBoundingClientRect();if(r.width<140||r.height<28||r.height>220)return false;if(/close/i.test(e.getAttribute('aria-label')||''))return false;if(e.querySelector('input,textarea'))return false;const st=getComputedStyle(e);const role=e.getAttribute('role')||'';return st.cursor==='pointer'||/option|radio|button/.test(role)||e.tagName==='BUTTON'||e.tagName==='A'||e.hasAttribute('tabindex');});const leaf=all.filter(e=>!all.some(x=>x!==e&&e.contains(x)));return {count:leaf.length};})())`)||'{}');
  if(info.count===1){const clicked=await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const root=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(vis)||document.body;const all=[...root.querySelectorAll('[role="option"],[role="radio"],button,a,[tabindex],div')].filter(e=>{if(!vis(e)||e===root)return false;const r=e.getBoundingClientRect();if(r.width<140||r.height<28||r.height>220)return false;if(/close/i.test(e.getAttribute('aria-label')||''))return false;if(e.querySelector('input,textarea'))return false;const st=getComputedStyle(e);const role=e.getAttribute('role')||'';return st.cursor==='pointer'||/option|radio|button/.test(role)||e.tagName==='BUTTON'||e.tagName==='A'||e.hasAttribute('tabindex');});const leaf=all.filter(e=>!all.some(x=>x!==e&&e.contains(x)));if(leaf.length!==1)return 0;leaf[0].click();return 1;})()`);if(clicked){await sleep(700);return {status:'SOLE_OPTION_SELECTED',count:1};}}
  return {status:'OWNER_DECISION_REQUIRED',count:Number(info.count||0)};
}
async function focusAppName(){return await ev(`(()=>{const vis=e=>!!(e&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));const ins=[...document.querySelectorAll('input,textarea')].filter(vis);let i=ins.find(x=>/app\\s*name|application\\s*name/i.test([x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' ')));if(!i)i=ins.find(x=>{let p=x.parentElement;for(let n=0;n<4&&p;n++,p=p.parentElement){if(/app\\s*name|application\\s*name/i.test((p.innerText||'').slice(0,300)))return true;}return false;});if(!i)return 0;i.focus();const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(i,'');else i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));return 1;})()`);}

try{
  const ts=await targets();const page=ts.find(t=>t.type==='page');if(!page?.webSocketDebuggerUrl)throw new Error('NO_PAGE');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('WS_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(t);res();};ws.onerror=rej;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};await send('Page.enable');await send('Runtime.enable');
  await nav('https://developers.tiktok.com/');if(/log in with your tiktok developer account/i.test(await body())){console.log('AUTH=NOT_SAVED');process.exitCode=2;}
  else{
    console.log('AUTH=OK');const opened=await openConnectFlow();console.log('CONNECT_FLOW_OPENED='+(opened?1:0));
    if(opened){
      const owner=await chooseOwner();console.log('OWNER_STATUS='+owner.status);console.log('OWNER_OPTION_COUNT='+owner.count);
      if(owner.status!=='LEGAL_CONFIRMATION_REQUIRED'&&owner.status!=='OWNER_DECISION_REQUIRED'){
        const confirmed=await clickText(['^Confirm$','^Continue$','^Next$']);console.log('OWNER_CONFIRMED='+(confirmed?1:0));if(confirmed)await sleep(4500);
        const focused=await focusAppName();console.log('APP_NAME_FIELD='+(focused?1:0));
        if(focused){await send('Input.insertText',{text:TARGET});await sleep(400);console.log('APP_NAME_TYPED=1');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await sleep(5000);}
        let t=await body();let ready=t.includes(TARGET)||/\/app(s)?\/[A-Za-z0-9_-]+/.test(String(await ev('location.pathname')));
        if(!ready&&focused){const saved=await clickText(['^Save$','^Create$','^Connect$','^Continue$','^Next$','^Confirm$']);console.log('FALLBACK_BUTTON='+(saved?1:0));if(saved)await sleep(5000);t=await body();ready=t.includes(TARGET)||/\/app(s)?\/[A-Za-z0-9_-]+/.test(String(await ev('location.pathname')));}
        console.log('TARGET_READY='+(ready?1:0));console.log('HAS_BASIC_INFO='+(/basic information|app details/i.test(t)?1:0));console.log('HAS_PRODUCTS='+(/products|add products/i.test(t)?1:0));console.log('HAS_SCOPES='+(/scopes/i.test(t)?1:0));console.log('DETAIL_PATH='+String(await ev('location.pathname')));
      }
    }
  }
}catch(e){console.log('ERROR='+String(e.message||e));process.exitCode=1;}
finally{try{ws?.close();}catch{}try{child.kill('SIGTERM');}catch{}await sleep(300);try{child.kill('SIGKILL');}catch{}}
