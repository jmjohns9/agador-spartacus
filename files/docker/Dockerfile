FROM node:22-bookworm

# System deps: Electron runtime libs + Xvfb/noVNC for headless GUI access,
# plus build tools for rebuilding native modules (serialport, better-sqlite3)
# against Electron's Node ABI on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify x11-utils \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libgtk-3-0 fonts-liberation \
    udev \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Rebuild only the native modules Electron actually loads at runtime, rather
# than electron-builder's default of rebuilding everything in node_modules —
# that sweep also hits ttf2woff2, a dev-only transitive dep of the icon
# tooling whose old nan-based addon doesn't compile against Electron 42's V8.
RUN npm run build \
    && npx electron-rebuild -f --only better-sqlite3,serialport

ENV DISPLAY=:99
ENV NODE_ENV=production
EXPOSE 6080

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
