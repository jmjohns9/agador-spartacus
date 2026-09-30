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

# Run as the image's unprivileged "node" user, in the dialout group so it can
# open USB-serial adapters.
RUN usermod -aG dialout node && mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

# npm ci's postinstall (electron-builder install-app-deps) rebuilds the
# runtime native modules, better-sqlite3 and serialport, for Electron's ABI.
# Renderer-only packages are devDependencies, so the icon tooling's
# ttf2woff2 addon (which doesn't build against Electron 42) is not touched.
COPY --chown=node:node package*.json ./
RUN npm ci

COPY --chown=node:node . .
RUN npm run build

ENV DISPLAY=:99
ENV NODE_ENV=production
EXPOSE 6080

COPY --chown=node:node docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
