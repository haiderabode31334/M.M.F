#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F VPS HEALTH ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"
echo

echo '--- OS / KERNEL ---'
uname -a || true
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "OS: ${PRETTY_NAME:-unknown}"
fi

echo

echo '--- UPTIME / LOAD ---'
uptime || true

echo

echo '--- CPU ---'
echo "CPUs: $(nproc 2>/dev/null || echo unknown)"

echo

echo '--- MEMORY ---'
free -h || true

echo

echo '--- DISK ---'
df -h / || true

echo

echo '--- SELECTED SERVICES ---'
for svc in nginx php8.3-fpm mongod ssh; do
  if command -v systemctl >/dev/null 2>&1; then
    state=$(systemctl is-active "$svc" 2>/dev/null || true)
    printf '%-16s %s\n' "$svc" "${state:-unknown}"
  fi
done

echo

echo '===== END HEALTH ====='
