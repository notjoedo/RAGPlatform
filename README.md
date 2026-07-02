# RAG Platform

A minimal RAG (Retrieval-Augmented Generation) app. Upload documents into named pipelines and chat with an AI agent grounded on your content.

## Features

- Create multiple document pipelines (knowledge bases)
- Upload PDF, TXT, and Markdown files
- Chat with retrieved context via **Ollama** (default, local & free)
- Optional **bring-your-own-key** for OpenAI or Anthropic
- Protected by a shared app API key (no user accounts)

## Prerequisites

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.com/) running locally (or via Docker)

Pull required Ollama models:

```bash
ollama pull nomic-embed-text
ollama pull llama3.2
```

## Quick Start (local)

**One command** (starts Ollama if installed, backend, and frontend):

```bash
./start.sh
```

To stop backend and frontend:

```bash
./start.sh stop
```

Or start manually:

1. Copy environment config:

```bash
cp .env.example .env
```

2. Start the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

3. Start the frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

4. Open http://localhost:5173 and enter the API key from `.env` (`change-me` by default).

## Docker

```bash
cp .env.example .env
docker compose up --build
```

After Ollama starts, pull models inside the container:

```bash
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.2
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Usage

1. Enter the app API key on first visit.
2. Create a pipeline (e.g. "Q3 Reports").
3. Upload documents — they are parsed, chunked, embedded, and stored in Chroma.
4. Ask questions in the chat panel. Answers cite source filenames.
5. Switch provider to OpenAI or Anthropic and enter your API key for cloud models.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check + Ollama status |
| POST | `/pipelines` | Create pipeline |
| GET | `/pipelines` | List pipelines |
| DELETE | `/pipelines/{id}` | Delete pipeline |
| POST | `/pipelines/{id}/documents` | Upload document |
| GET | `/pipelines/{id}/documents` | List documents |
| POST | `/pipelines/{id}/chat` | RAG chat (SSE stream) |

All endpoints except `/health` require the `X-API-Key` header.

## Project Structure

```
backend/     FastAPI API, ingest, retrieval, LLM
frontend/    Vite + React minimal UI
db/          SQLite metadata, Chroma vectors, uploads (gitignored)
```
