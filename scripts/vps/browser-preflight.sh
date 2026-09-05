#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F OPENCODE BRIDGE PREFLIGHT ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"

echo

echo '--- MEMORY ---'
free -h || true
grep -E '^(HugePages_Total|HugePages_Free|HugePages_Rsvd|Hugepagesize|Hugetlb):' /proc/meminfo || true
swapon --show || true

echo

echo '--- OPENCODE HEALTH ---'
health_tmp=$(mktemp)
health_code=$(curl -sS --max-time 10 -o "$health_tmp" -w '%{http_code}' http://127.0.0.1:4096/global/health || true)
echo "http_code=$health_code"
if [ "$health_code" = '200' ]; then
  cat "$health_tmp"
else
  echo 'OpenCode API is not anonymously accessible from the runner.'
fi
rm -f "$health_tmp"

echo

echo '--- OPENCODE MCP STATUS ---'
mcp_tmp=$(mktemp)
mcp_code=$(curl -sS --max-time 10 -o "$mcp_tmp" -w '%{http_code}' http://127.0.0.1:4096/mcp || true)
echo "http_code=$mcp_code"
if [ "$mcp_code" = '200' ]; then
  python3 - "$mcp_tmp" <<'PY'
import json,sys
try:
    data=json.load(open(sys.argv[1]))
    if isinstance(data,dict):
        for name,status in data.items():
            if isinstance(status,dict):
                state=status.get('status') or status.get('type') or status.get('state') or 'present'
            else:
                state=str(status)
            print(f'{name}: {state}')
    else:
        print('mcp_response_type=' + type(data).__name__)
except Exception as e:
    print('mcp_parse_error=' + type(e).__name__)
PY
else
  echo 'MCP status unavailable without OpenCode authentication.'
fi
rm -f "$mcp_tmp"

echo

echo '--- PLAYWRIGHT MCP PROCESSES ---'
ps -eo pid,user,comm,args | grep -Ei 'playwright-mcp|@playwright/mcp' | grep -v grep | head -n 20 || true

echo

echo '--- LOCAL PORTS ---'
ss -lnt 2>/dev/null | grep -E ':(4096|5900|5901|6080|6081|9222)\b' || true

echo

echo '===== END PREFLIGHT ====='
