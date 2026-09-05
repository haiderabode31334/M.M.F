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

echo '--- MEMINFO BREAKDOWN ---'
grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapCached|Active|Inactive|AnonPages|Mapped|Shmem|KReclaimable|Slab|SReclaimable|SUnreclaim|KernelStack|PageTables|Percpu|SwapTotal|SwapFree):' /proc/meminfo || true

echo

echo '--- PROCESS RSS SUMMARY ---'
ps -e -o rss= 2>/dev/null | awk '{sum+=$1; n++} END {printf "processes=%d total_rss=%.1f MiB\n", n, sum/1024}' || true

echo

echo '--- TOP 40 MEMORY PROCESSES ---'
ps -eo pid,ppid,user,comm,%mem,rss,%cpu,args --sort=-rss 2>/dev/null | head -n 41 || true

echo

echo '--- SYSTEMD CGROUP MEMORY ---'
if command -v systemd-cgtop >/dev/null 2>&1; then
  systemd-cgtop -b -n 1 --depth=3 2>/dev/null | head -n 45 || true
fi

echo

echo '--- DISK ---'
df -h / || true

echo

echo '--- SELECTED SERVICES ---'
for svc in nginx php8.3-fpm mongod mariadb mysql ssh; do
  if command -v systemctl >/dev/null 2>&1; then
    state=$(systemctl is-active "$svc" 2>/dev/null || true)
    printf '%-16s %s\n' "$svc" "${state:-unknown}"
  fi
done

echo

echo '===== END HEALTH ====='
