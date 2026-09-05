#!/usr/bin/env bash
set -euo pipefail

PROFILE="$HOME/mmf-browser-profile"
STATE_DIR="$HOME/mmf-browser-state"
CHROME="/snap/chromium/current/usr/lib/chromium-browser/chrome"
CDP_PORT=9223
MARKER="$STATE_DIR/tiktok-login-complete"

mkdir -p "$PROFILE" "$STATE_DIR"
cp scripts/vps/tiktok-login-local.mjs "$STATE_DIR/tiktok-login-local.mjs"
chmod 600 "$STATE_DIR/tiktok-login-local.mjs"
rm -f "$MARKER"

cleanup() {
  set +e
  [ -n "${CHROME_PID:-}" ] && kill "$CHROME_PID" 2>/dev/null || true
  sleep 1
  [ -n "${CHROME_PID:-}" ] && kill -9 "$CHROME_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pkill -u "$(id -u)" -f "remote-debugging-port=${CDP_PORT}" 2>/dev/null || true
sleep 1

"$CHROME" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-background-networking \
  --no-first-run \
  --no-default-browser-check \
  --window-size=1280,800 \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port="$CDP_PORT" \
  --remote-debugging-address=127.0.0.1 \
  --remote-allow-origins='*' \
  https://developers.tiktok.com/login \
  >/tmp/mmf-chrome-login.log 2>&1 &
CHROME_PID=$!

READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != 1 ] || ! kill -0 "$CHROME_PID" 2>/dev/null; then
  echo 'ERROR=CDP_BROWSER_NOT_READY'
  tail -n 20 /tmp/mmf-chrome-login.log 2>/dev/null || true
  exit 1
fi

echo 'LOGIN_SESSION_READY=1'
echo 'MODE=LOCAL_CDP'
echo "CDP_PORT=${CDP_PORT}"
echo 'TARGET=https://developers.tiktok.com/login'
echo 'PROFILE_PERSISTED=1'
echo 'SESSION_MINUTES=60'
echo "LOCAL_HELPER=${STATE_DIR}/tiktok-login-local.mjs"

for _ in $(seq 1 360); do
  sleep 10
  if [ -f "$MARKER" ]; then
    echo 'LOGIN_CONFIRMED=1'
    break
  fi
  kill -0 "$CHROME_PID" 2>/dev/null || break
done

echo 'LOGIN_SESSION_END=1'
