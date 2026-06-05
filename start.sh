#!/usr/bin/env bash
set -a
[ -f "$(dirname "$0")/.env" ] && . "$(dirname "$0")/.env"
set +a

PORT="${PORT:-3002}"
HOST="${HOST:-0.0.0.0}"

echo "[drift-coach] starting on http://${HOST}:${PORT} (FORZA UDP: ${FORZA_PORT:-5330})"
node "$(dirname "$0")/.output/server/index.mjs"
