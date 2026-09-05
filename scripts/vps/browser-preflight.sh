#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F BROWSER PREFLIGHT ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"
echo

echo '--- MEMORY ---'
free -h || true
grep -E '^(HugePages_Total|HugePages_Free|HugePages_Rsvd|Hugepagesize|Hugetlb):' /proc/meminfo || true
swapon --show || true

echo

echo '--- RUNTIMES ---'
for c in python3 pip3 node npm npx chromium chromium-browser google-chrome firefox Xvfb x11vnc websockify; do
  if command -v "$c" >/dev/null 2>&1; then
    printf '%-18s %s\n' "$c" "$(command -v "$c")"
  else
    printf '%-18s %s\n' "$c" 'missing'
  fi
done
python3 --version 2>/dev/null || true
node --version 2>/dev/null || true
npm --version 2>/dev/null || true

echo

echo '--- RELEVANT PROCESSES ---'
ps -eo pid,user,comm,args | grep -Ei 'chromium|chrome|firefox|Xvfb|x11vnc|websockify|novnc' | grep -v grep | head -n 30 || true

echo

echo '--- LISTENING LOCAL PORTS (selected) ---'
ss -lntp 2>/dev/null | grep -E ':(4096|5900|5901|6080|6081|9222)\b' || true

echo

echo '--- CHROMIUM HEADLESS TEST ---'
BROWSER=''
for c in chromium chromium-browser google-chrome; do
  if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
done
if [ -n "$BROWSER" ]; then
  echo "browser=$BROWSER"
  set +e
  timeout 45 "$BROWSER" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom https://example.com 2>&1 | head -n 25
  rc=${PIPESTATUS[0]}
  set -e
  echo "browser_test_exit=$rc"
else
  echo 'browser=missing'
fi

echo

echo '===== END PREFLIGHT ====='
