# syntax=docker/dockerfile:1
#
# Single image that hosts BOTH halves of OnFile:
#   - the Next.js frontend (this repo's root) — the actual website UI
#   - the FastAPI backend (./backend) — the AI job-search feature (resume
#     upload -> AI-parsed profile -> automated job discovery -> ranked
#     matches you can search yourself) PLUS the "Apply" auto-fill feature,
#     both lifted out of the careersavers reference project.
#
# Build:
#   docker build -t onfile .
# Run:
#   docker run -p 3000:3000 -p 8000:8000 onfile
# Then open http://localhost:3000 — the frontend calls the backend at
# http://localhost:8000 (published from the same container).
#
# "Apply" needs a Chrome window running on YOUR machine with remote
# debugging enabled (the backend connects to it over CDP to fill the
# form) — see the README note added alongside this file for the exact
# command. It is not something a container can start for you, since it
# has no screen to show a browser window on.
#
# Optional build-time override if you serve the frontend from a different
# host/port than localhost:8000 (NEXT_PUBLIC_* vars are baked in at build
# time, since they end up in the browser bundle):
#   docker build --build-arg NEXT_PUBLIC_CAREERSAVERS_API_URL=https://api.example.com -t onfile .

########################################
# 1. Build the Next.js frontend
########################################
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY jsconfig.json next.config.mjs postcss.config.js tailwind.config.js ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public

ARG NEXT_PUBLIC_CAREERSAVERS_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_CAREERSAVERS_API_URL=${NEXT_PUBLIC_CAREERSAVERS_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

########################################
# 2. Runtime image: Python (+ Playwright/Chromium, for scanning application
#    forms) and Node side by side
########################################
FROM mcr.microsoft.com/playwright/python:v1.52.0-jammy AS runtime

# Playwright's browsers are already baked into this base image at the
# version pinned in backend/requirements.txt (needed for the headless
# Chromium scan in form_analyzer.py — separate from the CDP connection
# "Apply" makes to YOUR already-running, visible Chrome). We add Node.js
# on top to also run the built Next.js app.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# --- Backend ---
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app ./backend/app

# --- Frontend runtime bits (built in stage 1) ---
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/.next ./.next
COPY --from=frontend-builder /app/package.json ./package.json
COPY --from=frontend-builder /app/public ./public
COPY next.config.mjs ./next.config.mjs

ARG NEXT_PUBLIC_CAREERSAVERS_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_CAREERSAVERS_API_URL=${NEXT_PUBLIC_CAREERSAVERS_API_URL}
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHONUNBUFFERED=1
# CDP endpoint the backend connects to for "Apply" — host.docker.internal
# resolves to your machine from inside the container (Docker Desktop on
# macOS/Windows out of the box; docker-compose.yml adds the mapping Linux
# needs too). Override per-run with `-e APPLICATION_CDP_ENDPOINT=...` if
# your setup differs.
ENV APPLICATION_CDP_ENDPOINT=http://host.docker.internal:9222

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 8000

CMD ["/usr/local/bin/docker-entrypoint.sh"]
