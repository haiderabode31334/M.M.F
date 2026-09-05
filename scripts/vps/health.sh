#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F VPS MEMORY TRACE ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"
echo "USER: $(whoami)"

echo
echo '--- FREE ---'
free -h || true

echo
echo '--- FULL /PROC/MEMINFO ---'
cat /proc/meminfo || true

echo
echo '--- PROCESS TOTALS ---'
ps -e -o rss= 2>/dev/null | awk '{sum+=$1; n++} END {printf "processes=%d total_rss=%.1f MiB\n", n, sum/1024}' || true
ps -e -o vsz= 2>/dev/null | awk '{sum+=$1} END {printf "total_vsz=%.1f MiB\n", sum/1024}' || true

echo
echo '--- PROCESS SWAP / LOCKED SUMMARY ---'
awk '
  /^VmRSS:/ {rss+=$2}
  /^VmSwap:/ {swap+=$2}
  /^VmLck:/ {lck+=$2}
  END {printf "status_sums: rss=%.1f MiB swap=%.1f MiB locked=%.1f MiB\n", rss/1024, swap/1024, lck/1024}
' /proc/[0-9]*/status 2>/dev/null || true

echo
echo '--- TOP MEMORY PROCESSES ---'
ps -eo pid,ppid,user,comm,%mem,rss,%cpu,args --sort=-rss 2>/dev/null | head -n 31 || true

echo
echo '--- CGROUP CURRENT ---'
for p in /sys/fs/cgroup /sys/fs/cgroup/system.slice /sys/fs/cgroup/user.slice; do
  if [ -r "$p/memory.current" ]; then
    v=$(cat "$p/memory.current")
    awk -v p="$p" -v v="$v" 'BEGIN {printf "%s = %.1f MiB\n", p, v/1048576}'
  fi
done

echo
echo '--- ROOT CGROUP MEMORY.STAT ---'
cat /sys/fs/cgroup/memory.stat 2>/dev/null || true

echo
echo '--- USER.SLICE CGROUP MEMORY.STAT ---'
cat /sys/fs/cgroup/user.slice/memory.stat 2>/dev/null || true

echo
echo '--- SYSTEM.SLICE CGROUP MEMORY.STAT ---'
cat /sys/fs/cgroup/system.slice/memory.stat 2>/dev/null || true

echo
echo '--- ZSWAP ---'
if [ -r /sys/module/zswap/parameters/enabled ]; then
  echo -n 'enabled='; cat /sys/module/zswap/parameters/enabled || true
fi
for f in /sys/kernel/debug/zswap/* /sys/module/zswap/parameters/*; do
  [ -r "$f" ] || continue
  printf '%s=' "$f"
  cat "$f" 2>/dev/null || true
done

echo
echo '--- TMPFS / SHM ---'
df -h /dev/shm /run 2>/dev/null || true
ipcs -m 2>/dev/null || true

echo
echo '--- SYSTEMD CGROUP TOP ---'
if command -v systemd-cgtop >/dev/null 2>&1; then
  systemd-cgtop -b -n 1 --depth=4 2>/dev/null | head -n 100 || true
fi

echo
echo '===== END TRACE ====='
