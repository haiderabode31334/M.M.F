#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"
PROFILE="$HOME/mmf-browser-profile"
CHROME="/snap/chromium/current/usr/lib/chromium-browser/chrome"
VNC_PORT=5901
WEB_PORT=6081

mkdir -p "$PROFILE"

NOVNC_WEB=""
for d in /usr/share/novnc /usr/local/share/novnc /usr/share/noVNC; do
  if [ -f "$d/vnc.html" ]; then NOVNC_WEB="$d"; break; fi
done

if [ -z "$NOVNC_WEB" ]; then
  echo 'ERROR=noVNC web root not found'
  exit 1
fi

cleanup() {
  set +e
  [ -n "${WS_PID:-}" ] && kill "$WS_PID" 2>/dev/null
  [ -n "${VNC_PID:-}" ] && kill "$VNC_PID" 2>/dev/null
  [ -n "${CHROME_PID:-}" ] && kill "$CHROME_PID" 2>/dev/null
  [ -n "${XVFB_PID:-}" ] && kill "$XVFB_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

pkill -u "$(id -u)" -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
pkill -u "$(id -u)" -f "x11vnc.*${VNC_PORT}" 2>/dev/null || true
pkill -u "$(id -u)" -f "websockify.*${WEB_PORT}" 2>/dev/null || true
sleep 1

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp -ac >/tmp/mmf-xvfb.log 2>&1 &
XVFB_PID=$!
sleep 2

"$CHROME" \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --window-size=1280,800 \
  --user-data-dir="$PROFILE" \
  https://developers.tiktok.com/login \
  >/tmp/mmf-chrome-login.log 2>&1 &
CHROME_PID=$!
sleep 4

x11vnc -display "$DISPLAY" -localhost -nopw -forever -shared -rfbport "$VNC_PORT" >/tmp/mmf-x11vnc.log 2>&1 &
VNC_PID=$!
sleep 2

websockify --web="$NOVNC_WEB" "127.0.0.1:${WEB_PORT}" "127.0.0.1:${VNC_PORT}" >/tmp/mmf-websockify.log 2>&1 &
WS_PID=$!
sleep 2

if ! kill -0 "$XVFB_PID" "$CHROME_PID" "$VNC_PID" "$WS_PID" 2>/dev/null; then
  echo 'ERROR=one or more login-session processes failed'
  echo '--- xvfb ---'; tail -n 20 /tmp/mmf-xvfb.log 2>/dev/null || true
  echo '--- chrome ---'; tail -n 20 /tmp/mmf-chrome-login.log 2>/dev/null || true
  echo '--- x11vnc ---'; tail -n 20 /tmp/mmf-x11vnc.log 2>/dev/null || true
  echo '--- websockify ---'; tail -n 20 /tmp/mmf-websockify.log 2>/dev/null || true
  exit 1
fi

echo 'LOGIN_SESSION_READY=1'
echo 'LOCAL_ONLY=1'
echo "NOVNC_PORT=${WEB_PORT}"
echo 'TARGET=https://developers.tiktok.com/login'
echo 'PROFILE_PERSISTED=1'
echo 'SESSION_MINUTES=30'

# Keep the private interactive login session alive for 30 minutes.
for i in $(seq 1 180); do
  sleep 10
  kill -0 "$CHROME_PID" "$VNC_PID" "$WS_PID" 2>/dev/null || break
done

echo 'LOGIN_SESSION_END=1'
