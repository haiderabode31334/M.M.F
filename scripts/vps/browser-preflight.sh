#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F DIRECT CHROMIUM PREFLIGHT ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"

echo

echo '--- MEMORY ---'
free -h || true
grep -E '^(HugePages_Total|HugePages_Free|HugePages_Rsvd|Hugepagesize|Hugetlb):' /proc/meminfo || true

echo

echo '--- OPENCODE HEALTH ---'
code=$(curl -sS --max-time 8 -o /tmp/mmf-oc-health.$$ -w '%{http_code}' http://127.0.0.1:4096/global/health || true)
echo "http_code=$code"
rm -f /tmp/mmf-oc-health.$$

echo

echo '--- DIRECT SNAP CHROMIUM CANDIDATES ---'
for p in \
  /snap/chromium/current/usr/lib/chromium-browser/chrome \
  /snap/chromium/current/usr/lib/chromium-browser/chromium \
  /snap/chromium/current/usr/lib/chromium-browser/chromium-browser; do
  if [ -x "$p" ]; then
    echo "candidate=$p"
    set +e
    out=$(timeout 45 "$p" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom https://example.com 2>&1)
    rc=$?
    set -e
    echo "exit=$rc"
    printf '%s\n' "$out" | head -n 20
  fi
done

echo

echo '--- SNAP CHROMIUM TREE (shallow) ---'
find /snap/chromium/current/usr/lib -maxdepth 3 -type f \( -name chrome -o -name chromium -o -name chromium-browser \) -perm -111 2>/dev/null | head -n 20 || true

echo

echo '===== END PREFLIGHT ====='
