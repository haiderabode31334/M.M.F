import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const targetUrl = process.argv[2] || 'https://example.com';
const chrome = '/snap/chromium/current/usr/lib/chromium-browser/chrome';
const profile = path.join(os.homedir(), 'mmf-browser-profile');
const stateDir = path.join(os.homedir(), 'mmf-browser-state');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const port = 9222;
const child = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  '--remote-debugging-address=127.0.0.1',
  '--remote-allow-origins=*',
  'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitJson(url, attempts=60) {
  for (let i=0; i<attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

let ws;
let seq = 0;
const pending = new Map();
const eventWaiters = new Map();

function send(method, params={}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function waitEvent(name, timeout=30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
    eventWaiters.set(name, value => { clearTimeout(timer); eventWaiters.delete(name); resolve(value); });
  });
}

async function main() {
  const targets = await waitJson(`http://127.0.0.1:${port}/json`);
  const page = targets.find(t => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No page target found');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = e => { clearTimeout(timer); reject(e); };
  });

  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      return;
    }
    if (msg.method && eventWaiters.has(msg.method)) eventWaiters.get(msg.method)(msg.params);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = waitEvent('Page.loadEventFired', 45000).catch(() => null);
  await send('Page.navigate', { url: targetUrl });
  await loaded;
  await sleep(2500);

  const info = await send('Runtime.evaluate', {
    expression: `JSON.stringify({title:document.title,url:location.href,text:(document.body?.innerText||'').slice(0,12000),links:Array.from(document.querySelectorAll('a')).slice(0,80).map(a=>({text:(a.innerText||a.textContent||'').trim().slice(0,120),href:a.href}))})`,
    returnByValue: true
  });
  const value = info?.result?.value || '{}';
  fs.writeFileSync(path.join(stateDir, 'latest-page.json'), value);

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 45, captureBeyondViewport: false });
  if (shot?.data) fs.writeFileSync(path.join(stateDir, 'latest.jpg'), Buffer.from(shot.data, 'base64'));

  const parsed = JSON.parse(value);
  console.log('BROWSER_OK=1');
  console.log('TITLE=' + String(parsed.title || '').replace(/\s+/g,' ').slice(0,200));
  console.log('URL=' + String(parsed.url || '').slice(0,500));
  console.log('TEXT_BEGIN');
  console.log(String(parsed.text || '').slice(0,6000));
  console.log('TEXT_END');
  console.log(`STATE_DIR=${stateDir}`);
  console.log(`PROFILE_DIR=${profile}`);
}

try {
  await main();
} finally {
  try { ws?.close(); } catch {}
  try { child.kill('SIGTERM'); } catch {}
  await sleep(500);
  try { child.kill('SIGKILL'); } catch {}
}
