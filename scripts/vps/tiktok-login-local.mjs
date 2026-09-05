import readline from 'node:readline/promises';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 9223;
const STATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MARKER = path.join(STATE_DIR, 'tiktok-login-complete');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      if (r.ok) {
        const targets = await r.json();
        const page = targets.find(t => t.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('Local Chromium CDP session is not ready');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.onopen = () => {
      const send = (method, params = {}) => new Promise((res, rej) => {
        const id = ++seq;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
        }
      };
      resolve({ ws, send });
    };
    ws.onerror = reject;
  });
}

async function promptHidden(label) {
  if (!process.stdin.isTTY) throw new Error('Run this helper from an interactive terminal');
  process.stdout.write(label);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  return await new Promise(resolve => {
    const onData = buf => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  try { fs.unlinkSync(MARKER); } catch {}
  const page = await getPageTarget();
  const { ws, send } = await connect(page.webSocketDebuggerUrl);
  const evalValue = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');

  let url = String(await evalValue('location.href') || '');
  if (!url.includes('developers.tiktok.com/login')) {
    await send('Page.navigate', { url: 'https://developers.tiktok.com/login' });
    await sleep(6000);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('TikTok developer email: ')).trim();
  rl.close();
  const password = await promptHidden('TikTok developer password: ');

  const foundRaw = await evalValue(`(() => {
    const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const inputs = [...document.querySelectorAll('input')].filter(visible);
    const pass = inputs.find(i => (i.type || '').toLowerCase() === 'password');
    const user = inputs.find(i => (i.type || '').toLowerCase() === 'email') ||
      inputs.find(i => /email|user|account/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' ')) && i !== pass) ||
      inputs.find(i => i !== pass && !['hidden','checkbox','radio','submit','button'].includes((i.type||'').toLowerCase()));
    if (!user || !pass) return JSON.stringify({ok:false,count:inputs.length});
    user.dataset.mmfLoginUser='1';
    pass.dataset.mmfLoginPass='1';
    return JSON.stringify({ok:true,count:inputs.length});
  })()`);
  const found = JSON.parse(foundRaw || '{}');
  if (!found.ok) {
    console.log('STATUS=FIELDS_NOT_FOUND');
    console.log(`INPUT_COUNT=${found.count ?? 0}`);
    ws.close();
    return;
  }

  await evalValue(`(() => { const e=document.querySelector('[data-mmf-login-user="1"]'); e.focus(); e.value=''; return true; })()`);
  await send('Input.insertText', { text: email });
  await sleep(300);
  await evalValue(`(() => { const e=document.querySelector('[data-mmf-login-pass="1"]'); e.focus(); e.value=''; return true; })()`);
  await send('Input.insertText', { text: password });
  await sleep(500);

  console.log('CREDENTIALS_FILLED=1');

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(1000);
  const clicked = await evalValue(`(() => {
    const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const buttons=[...document.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible);
    const b=buttons.find(x=>/^(log in|login|sign in)$/i.test((x.innerText||x.value||x.textContent||'').trim())) ||
      buttons.find(x=>/log in|login|sign in/i.test((x.innerText||x.value||x.textContent||'').trim()));
    if (!b) return false;
    if (!b.disabled) b.click();
    return !b.disabled;
  })()`);
  console.log(`LOGIN_SUBMITTED=${clicked ? 1 : 0}`);

  await sleep(9000);
  const stateRaw = await evalValue(`JSON.stringify({
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 6000),
    frames: [...document.querySelectorAll('iframe')].map(f => f.src || '').slice(0,20),
    alerts: [...document.querySelectorAll('[role="alert"],[aria-live],.error,[class*="error"],[class*="Error"],[data-e2e*="error"]')]
      .filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length)
      .map(e => (e.innerText || e.textContent || '').trim()).filter(Boolean).slice(0,20),
    inputs: [...document.querySelectorAll('input')]
      .filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length)
      .map(i => ({type:i.type,name:i.name,id:i.id,placeholder:i.placeholder,autocomplete:i.autocomplete,maxLength:i.maxLength}))
  })`);
  const state = JSON.parse(stateRaw || '{}');
  const text = String(state.text || '');
  const currentUrl = String(state.url || '');
  const frameText = (state.frames || []).join(' ');

  if (!currentUrl.includes('/login')) {
    fs.writeFileSync(MARKER, 'ok\n', { mode: 0o600 });
    console.log('STATUS=LOGGED_IN');
    console.log(`URL=${currentUrl}`);
    ws.close();
    return;
  }

  if (/captcha|verify you are human|security check|slide to verify/i.test(text + ' ' + frameText)) {
    console.log('STATUS=CAPTCHA_REQUIRED');
    ws.close();
    return;
  }

  const otpMeta = (state.inputs || []).find(i => /one-time|otp|verification|verify|code/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' ')) || (i.maxLength > 0 && i.maxLength <= 8 && i.type !== 'password'));
  if (/verification code|verify code|enter code|security code|one-time/i.test(text) || otpMeta) {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = (await rl2.question('Verification code: ')).trim();
    rl2.close();
    const otpFound = await evalValue(`(() => {
      const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const inputs=[...document.querySelectorAll('input')].filter(visible);
      const otp=inputs.find(i=>/one-time|otp|verification|verify|code/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' '))) || inputs.find(i=>i.maxLength>0&&i.maxLength<=8&&i.type!=='password');
      if(!otp)return false; otp.focus(); otp.value=''; otp.dataset.mmfOtp='1'; return true;
    })()`);
    if (!otpFound) {
      console.log('STATUS=OTP_FIELD_NOT_FOUND');
      ws.close();
      return;
    }
    await send('Input.insertText', { text: code });
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13 });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13 });
    await sleep(8000);
    const after = String(await evalValue('location.href') || '');
    if (!after.includes('/login')) {
      fs.writeFileSync(MARKER, 'ok\n', { mode: 0o600 });
      console.log('STATUS=LOGGED_IN');
    } else {
      console.log('STATUS=CHECK_BROWSER_STATE');
    }
    console.log(`URL=${after}`);
    ws.close();
    return;
  }

  const candidates=[...(state.alerts||[]),...text.split('\n').map(s=>s.trim()).filter(Boolean)];
  const useful=[...new Set(candidates)]
    .filter(s=>/incorrect|invalid|wrong|try again|failed|unable|not found|locked|too many|error|does not match|doesn't match|something went wrong/i.test(s))
    .filter(s=>s.length<=300)
    .slice(0,5);

  console.log('STATUS=LOGIN_NOT_CONFIRMED');
  if(useful.length) useful.forEach((s,i)=>console.log(`DETAIL_${i+1}=${s}`));
  else console.log('DETAIL_1=NO_VISIBLE_ERROR_MESSAGE');
  console.log(`URL=${currentUrl}`);
  ws.close();
}

main().catch(err => {
  console.error(`ERROR=${err.message}`);
  process.exit(1);
});
