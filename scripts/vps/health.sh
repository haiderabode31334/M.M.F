#!/usr/bin/env bash
set -euo pipefail

echo '===== M.M.F HUGEPAGES TRACE ====='
echo "UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "HOST: $(hostname)"

echo
echo '--- CURRENT MEMORY ---'
free -h || true
grep -E '^(MemTotal|MemFree|MemAvailable|HugePages_Total|HugePages_Free|HugePages_Rsvd|HugePages_Surp|Hugepagesize|Hugetlb):' /proc/meminfo || true

echo
echo '--- HUGEPAGE POOLS ---'
for d in /sys/kernel/mm/hugepages/hugepages-*; do
  [ -d "$d" ] || continue
  echo "[$d]"
  for f in nr_hugepages free_hugepages resv_hugepages surplus_hugepages nr_overcommit_hugepages; do
    [ -r "$d/$f" ] && printf '%s=' "$f" && cat "$d/$f"
  done
done

echo
echo '--- KERNEL CMDLINE ---'
cat /proc/cmdline || true

echo
echo '--- SYSCTL CURRENT ---'
sysctl vm.nr_hugepages 2>/dev/null || true
sysctl vm.nr_overcommit_hugepages 2>/dev/null || true

echo
echo '--- PERSISTENT CONFIG MATCHES ---'
grep -RniE 'hugepages|nr_hugepages|hugetlb' /etc/sysctl.conf /etc/sysctl.d /etc/default/grub /etc/default/grub.d /etc/systemd/system 2>/dev/null || true

echo
echo '===== END HUGEPAGES TRACE ====='
