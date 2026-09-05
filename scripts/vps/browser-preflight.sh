#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F TIKTOK APP DASHBOARD TEST ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"

echo

echo '--- MEMORY ---'
free -h || true
grep -E '^(HugePages_Total|HugePages_Free|HugePages_Rsvd|Hugepagesize|Hugetlb):' /proc/meminfo || true

echo

echo '--- TIKTOK APPS DASHBOARD ---'
node scripts/vps/cdp-browser.mjs https://developers.tiktok.com/apps/

echo

echo '===== END TEST ====='
