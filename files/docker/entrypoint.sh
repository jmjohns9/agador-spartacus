#!/bin/sh
set -e

Xvfb "$DISPLAY" -screen 0 1400x900x24 &

# Give Xvfb a moment to bind before anything tries to connect to it.
for i in $(seq 1 20); do
  xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
  sleep 0.25
done

# The VNC session is full control of the app (stored API key, saved sessions,
# a connected vehicle), so it always has a password. Set VNC_PASSWORD, or one
# is generated and printed to the container log.
if [ -z "$VNC_PASSWORD" ]; then
  VNC_PASSWORD=$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12)
  echo "noVNC password (generated; set VNC_PASSWORD to choose one): $VNC_PASSWORD"
fi
PASSFILE=$(mktemp)
x11vnc -storepasswd "$VNC_PASSWORD" "$PASSFILE" >/dev/null 2>&1
unset VNC_PASSWORD

# x11vnc only listens inside the container; websockify is the one way in.
x11vnc -display "$DISPLAY" -forever -shared -localhost -rfbauth "$PASSFILE" -rfbport 5900 -quiet &

websockify --web=/usr/share/novnc 6080 localhost:5900 &

exec npx electron . --no-sandbox --disable-gpu
