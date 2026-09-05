import readline from 'node:readline/promises';
import process from 'node:process';

const PORT = 9223;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      if (r.ok) {
        const targets = await r.json();
        const page = targets.find(t => t.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await sleep(500);
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
      ws.onmessage = (ev) => {
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
  readline.emitKeypressEvents?.(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  return await new Promise((resolve) => {
    const onData = (buf) => {
      const s = buf.toString('utf8');
      for (const ch of s) {
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
  const page = await getPageTarget();
  const { ws, send } = await connect(page.webSocketDebuggerUrl);
  const evalValue = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');

  let url = await evalValue('location.href');
  if (!String(url).includes('developers.tiktok.com/login')) {
    await send('Page.navigate', { url: 'https://developers.tiktok.com/login' });
    await sleep(6000);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('TikTok developer email: ')).trim();
  rl.close();
  const password = await promptHidden('TikTok developer password: ');

  const payload = JSON.stringify({ email, password });
  const fillResult = await evalValue(`(() => {
    const creds = ${payload};
    const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const inputs = [...document.querySelectorAll('input')].filter(visible);
    const pass = inputs.find(i => (i.type || '').toLowerCase() === 'password');
    const user = inputs.find(i => (i.type || '').toLowerCase() === 'email') ||
      inputs.find(i => /email|user|account/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' ')) && i !== pass) ||
      inputs.find(i => i !== pass && !['hidden','checkbox','radio','submit','button'].includes((i.type||'').toLowerCase()));
    function setValue(el, value) {
      if (!el) return false;
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const userOk = setValue(user, creds.email);
    const passOk = setValue(pass, creds.password);
    const buttons = [...document.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible);
    const submit = buttons.find(b => /^(log in|login|sign in)$/i.test((b.innerText || b.value || b.textContent || '').trim())) ||
      buttons.find(b => /log in|login|sign in/i.test((b.innerText || b.value || b.textContent || '').trim()));
    if (submit) submit.click();
    else if (pass?.form) pass.form.requestSubmit();
    return JSON.stringify({ userOk, passOk, submitted: !!submit || !!pass?.form, inputCount: inputs.length });
  })()`);

  const fr = JSON.parse(fillResult || '{}');
  if (!fr.userOk || !fr.passOk) {
    console.log('STATUS=FIELDS_NOT_FOUND');
    console.log(`INPUT_COUNT=${fr.inputCount ?? 0}`);
    ws.close();
    return;
  }

  console.log('CREDENTIALS_FILLED=1');
  console.log('LOGIN_SUBMITTED=1');
  await sleep(7000);

  const stateRaw = await evalValue(`JSON.stringify({
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 3000),
    inputs: [...document.querySelectorAll('input')].filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length).map(i => ({type:i.type,name:i.name,id:i.id,placeholder:i.placeholder,autocomplete:i.autocomplete,maxLength:i.maxLength}))
  })`);
  const state = JSON.parse(stateRaw || '{}');
  const text = String(state.text || '');
  const currentUrl = String(state.url || '');

  if (!currentUrl.includes('/login')) {
    console.log('STATUS=LOGGED_IN');
    console.log(`URL=${currentUrl}`);
    ws.close();
    return;
  }

  if (/captcha|verify you are human|security check|slide to verify/i.test(text)) {
    console.log('STATUS=CAPTCHA_REQUIRED');
    ws.close();
    return;
  }

  const otpMeta = (state.inputs || []).find(i => /one-time|otp|verification|verify|code/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' ')) || (i.maxLength > 0 && i.maxLength <= 8 && i.type !== 'password'));
  if (/verification code|verify code|enter code|security code|one-time/i.test(text) || otpMeta) {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = (await rl2.question('Verification code: ')).trim();
    rl2.close();
    const codePayload = JSON.stringify(code);
    const otpResult = await evalValue(`(() => {
      const code = ${codePayload};
      const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const inputs = [...document.querySelectorAll('input')].filter(visible);
      const otp = inputs.find(i => /one-time|otp|verification|verify|code/i.test([i.name,i.id,i.placeholder,i.autocomplete].join(' '))) ||
        inputs.find(i => i.maxLength > 0 && i.maxLength <= 8 && i.type !== 'password');
      if (!otp) return 'no-otp';
      const proto = Object.getPrototypeOf(otp);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(otp, code); else otp.value = code;
      otp.focus();
      otp.dispatchEvent(new Event('input', { bubbles: true }));
      otp.dispatchEvent(new Event('change', { bubbles: true }));
      const buttons = [...document.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible);
      const submit = buttons.find(b => /verify|confirm|continue|submit|log in|login/i.test((b.innerText || b.value || b.textContent || '').trim()));
      if (submit) submit.click(); else if (otp.form) otp.form.requestSubmit();
      return 'submitted';
    })()`);
    console.log(`VERIFICATION_SUBMIT=${otpResult}`);
    await sleep(7000);
    const after = await evalValue('location.href');
    console.log(String(after).includes('/login') ? 'STATUS=CHECK_BROWSER_STATE' : 'STATUS=LOGGED_IN');
    console.log(`URL=${after}`);
    ws.close();
    return;
  }

  const safeLine = text.split('\n').map(s => s.trim()).filter(Boolean).find(s => /incorrect|invalid|error|failed|password|account/i.test(s));
  console.log('STATUS=LOGIN_NOT_CONFIRMED');
  if (safeLine) console.log(`MESSAGE=${safeLine.slice(0, 240)}`);
  console.log(`URL=${currentUrl}`);
  ws.close();
}

main().catch(err => {
  console.error(`ERROR=${err.message}`);
  process.exit(1);
});
