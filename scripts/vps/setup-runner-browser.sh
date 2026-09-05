#!/usr/bin/env bash
set -euo pipefail

BASE="$HOME/mmf-browser-agent"
mkdir -p "$BASE"
cd "$BASE"

export PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"

if [ ! -f package.json ]; then
  npm init -y >/dev/null 2>&1
fi

if [ ! -d node_modules/playwright ]; then
  echo 'Installing Playwright package...'
  npm install --no-audit --no-fund playwright@latest
else
  echo 'Playwright package already present.'
fi

echo 'Installing/updating Playwright Chromium...'
npx playwright install chromium

cat > smoke.mjs <<'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
console.log('title=' + await page.title());
console.log('url=' + page.url());
await browser.close();
EOF

echo '--- PLAYWRIGHT VERSION ---'
npx playwright --version

echo '--- BROWSER CACHE ---'
du -sh "$PLAYWRIGHT_BROWSERS_PATH" 2>/dev/null || true

echo '--- SMOKE TEST ---'
node smoke.mjs

echo '--- MEMORY AFTER TEST ---'
free -h

echo 'BROWSER_AGENT_READY=1'
