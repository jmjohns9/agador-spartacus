#!/bin/sh
set -e

Xvfb "$DISPLAY" -screen 0 1400x900x24 &
XVFB_PID=$!

# Give Xvfb a moment to bind before anything tries to connect to it.
for i in $(seq 1 20); do
  xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
  sleep 0.25
done

x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport 5900 -quiet &

websockify --web=/usr/share/novnc 6080 localhost:5900 &

trap 'kill $XVFB_PID 2>/dev/null' TERM INT

exec npx electron . --no-sandbox --disable-gpu
