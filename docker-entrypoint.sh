#!/usr/bin/env bash
# Starts both services in one container and stops both if either dies or
# the container is asked to shut down.
set -euo pipefail

cd /srv/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd /srv
npm run start -- -p "${PORT:-3000}" &
FRONTEND_PID=$!

shutdown() {
  kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# Exit as soon as either process exits, so the container's health reflects
# the actual state instead of silently limping along on one service.
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
shutdown
exit "$EXIT_CODE"
