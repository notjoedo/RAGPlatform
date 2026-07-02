#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT=8000
FRONTEND_PORT=5173
OLLAMA_PORT=11434

PIDS=()
STARTED_OLLAMA=false

log() { printf '%s\n' "$*"; }

port_in_use() {
  lsof -ti ":$1" >/dev/null 2>&1
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local i
  for i in {1..30}; do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  log "Timed out waiting for $label ($url)"
  return 1
}

cleanup() {
  log ""
  log "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  if $STARTED_OLLAMA; then
    kill "${OLLAMA_PID:-}" 2>/dev/null || true
  fi
}

stop_all() {
  log "Stopping RAG Platform services..."
  for port in "$FRONTEND_PORT" "$BACKEND_PORT"; do
    if port_in_use "$port"; then
      lsof -ti ":$port" | xargs kill 2>/dev/null || true
      log "  Stopped process on port $port"
    fi
  done
  log "Done. (Ollama left running if it was already started separately.)"
}

start_ollama() {
  if ! command -v ollama >/dev/null 2>&1; then
    log "Ollama not installed — skipping. Install from https://ollama.com or use OpenAI/Anthropic in the app."
    return
  fi

  if curl -sf "http://localhost:${OLLAMA_PORT}/api/tags" >/dev/null 2>&1; then
    log "Ollama already running"
    return
  fi

  log "Starting Ollama..."
  ollama serve >/dev/null 2>&1 &
  OLLAMA_PID=$!
  STARTED_OLLAMA=true
  PIDS+=("$OLLAMA_PID")
  wait_for_url "http://localhost:${OLLAMA_PORT}/api/tags" "Ollama"
}

setup_backend() {
  if [[ ! -d backend/.venv ]]; then
    log "Creating Python virtual environment..."
    python3 -m venv backend/.venv
  fi

  if ! backend/.venv/bin/python -c "import fastapi" 2>/dev/null; then
    log "Installing backend dependencies..."
    backend/.venv/bin/pip install -q -r backend/requirements.txt
  fi
}

setup_frontend() {
  if [[ ! -d frontend/node_modules ]]; then
    log "Installing frontend dependencies..."
    (cd frontend && npm install)
  fi
}

start_backend() {
  if curl -sf "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    log "Backend already running on :$BACKEND_PORT"
    return
  fi

  if port_in_use "$BACKEND_PORT"; then
    log "Port $BACKEND_PORT is in use by another process. Run: ./start.sh stop"
    exit 1
  fi

  log "Starting backend on :$BACKEND_PORT..."
  (cd backend && ../backend/.venv/bin/uvicorn main:app --reload --port "$BACKEND_PORT") &
  PIDS+=("$!")
  wait_for_url "http://localhost:${BACKEND_PORT}/health" "backend"
}

start_frontend() {
  if curl -sf "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1; then
    log "Frontend already running on :$FRONTEND_PORT"
    return
  fi

  if port_in_use "$FRONTEND_PORT"; then
    log "Port $FRONTEND_PORT is in use by another process. Run: ./start.sh stop"
    exit 1
  fi

  log "Starting frontend on :$FRONTEND_PORT..."
  (cd frontend && npm run dev -- --port "$FRONTEND_PORT") &
  PIDS+=("$!")
  wait_for_url "http://localhost:${FRONTEND_PORT}" "frontend"
}

start_all() {
  if [[ ! -f .env ]]; then
    log "Creating .env from .env.example..."
    cp .env.example .env
  fi

  start_ollama
  setup_backend
  setup_frontend
  start_backend
  start_frontend

  API_KEY="$(grep -E '^APP_API_KEY=' .env | cut -d= -f2- || echo 'change-me')"

  log ""
  log "RAG Platform is ready"
  log "  App:     http://localhost:${FRONTEND_PORT}"
  log "  API:     http://localhost:${BACKEND_PORT}"
  log "  API key: ${API_KEY}"
  log ""
  log "Press Ctrl+C to stop services started by this script."

  if [[ ${#PIDS[@]} -eq 0 ]]; then
    exit 0
  fi

  trap cleanup SIGINT SIGTERM
  wait
}

case "${1:-start}" in
  start) start_all ;;
  stop)  stop_all ;;
  *)
    log "Usage: ./start.sh [start|stop]"
    exit 1
    ;;
esac
