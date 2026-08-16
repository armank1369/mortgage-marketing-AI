# Joseph's Mortgage Marketing AI Tool

A marketing content assistant for Joseph Kim, a California mortgage broker. The current prototype uses a React/Vite frontend and a Flask backend connected to Anthropic Claude for compliance-aware social media planning and content generation.

## Prerequisites

- **Node.js** and npm
- **Python 3.10+**
- **Anthropic API key**

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd mortgage-marketing-AI
```

### 2. Configure the backend

Create `server/.env` with your Anthropic credentials:

```text
ANTHROPIC_API_KEY=your-key-here
ANTHROPIC_MODEL=claude-sonnet-5
```

The model can be changed through `ANTHROPIC_MODEL` without changing application code.

### 3. Install backend dependencies

Windows PowerShell:

```powershell
cd server
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Start the backend:

```powershell
python app.py
```

The Flask API runs on `http://localhost:5001`.

### 4. Install frontend dependencies

In a second terminal:

```powershell
cd client
npm ci
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies `/api` requests to the Flask backend.

## Usage

1. Open `http://localhost:3000`.
2. Complete the brand/persona setup if no preferences have been saved yet.
3. Start a chat and request captions, post ideas, content briefs, or campaign planning.
4. Use the generated content cards to review, copy, regenerate, or refine content.

## Current Storage Model

- Brand preferences and frontend chat sessions are stored in browser `localStorage`.
- The Flask backend currently maintains its own SQLite `chat_history` for generated responses and duplicate-content prevention.
- Frontend chat-session metadata is intentionally structured so it can later move to database-backed `chat_sessions` and `chat_messages` records without redesigning the UI.

## Documentation

- [`docs/PROTOTYPE_UI_CHANGES.md`](docs/PROTOTYPE_UI_CHANGES.md) — current prototype cleanup, chat metadata design, migration considerations, and testing notes.
- [`SESSION_SUMMARY_2026-08-06.md`](SESSION_SUMMARY_2026-08-06.md) — earlier Claude migration and feature-development summary.

## Project Structure

```text
├── client/          # React + Vite + Tailwind CSS
├── server/          # Flask + Anthropic API + SQLite history
├── docs/            # Technical / change documentation
├── .gitignore
└── README.md
```

## Normal Local Startup

Terminal 1 — backend:

```powershell
cd "D:\ZeTechProjects\arman\mortgage-marketing-AI\server"
.\venv\Scripts\Activate.ps1
python app.py
```

Terminal 2 — frontend:

```powershell
cd "D:\ZeTechProjects\arman\mortgage-marketing-AI\client"
npm run dev
```
