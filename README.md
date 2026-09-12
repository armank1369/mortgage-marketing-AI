# Lucie: AI Social Media Assistant for Mortgage Brokers

Lucie is a compliance-aware social media drafting and planning assistant built for Lucent Brokerage. The prototype pairs a React/Vite frontend with a Flask backend, powered by the Anthropic Claude API (`claude-sonnet-5`), to automate content generation while enforcing mortgage industry fair-housing guidelines and RESPA regulations.

## 📊 Project Documentation (Start Here)

- **[Technical Audit & Risk Assessment](docs/Lucie_Technical_Audit_Whitepaper.pdf)** — a live-measured breakdown of system architecture, prompt-caching economics (~39% cost reduction over a realistic session), and the bias/fairness/privacy guardrails, verified against the running production API and codebase.
- **[End-User Manual](docs/Lucie_User_Manual.pdf)** — a plain-language guide translating the tool's capabilities and safety requirements for non-technical mortgage staff.
- **[Prototype UI Changes](docs/PROTOTYPE_UI_CHANGES.md)** — a log of prototype cleanup work, chat-metadata design, and migration considerations.
- **[Session Summary](SESSION_SUMMARY_2026-08-06.md)** — dev log of an earlier Claude migration and feature-development pass.

## 🚀 V2 Roadmap & Known Technical Debt

This repository is a fast-paced V1 prototype built during the Titan Applied AI and Entrepreneurship Summer Fellowship. The Technical Audit above documents these in full; the headline items slated for V2 are:

- **State management:** Brand preferences and chat sessions live entirely in the browser's `localStorage`, and the backend's own SQLite `chat_history` exists only for duplicate-content prevention — there is no server-side database of record, no authentication, and no cross-device sync. The chat-session data is structured so it can move into database-backed tables without a UI redesign, but that migration hasn't happened yet.
- **Privacy hardening:** There is no filtering on chat input today, so sensitive client details typed into the assistant are sent as-is to the API and stored unencrypted client-side. V2 adds input redaction and a secure datastore.
- **Deterministic routing:** Whether a message is treated as a single post, a full campaign, or an ambiguous request is currently decided by two hardcoded regex patterns rather than a model-based classifier — reliable in testing, but brittle outside the patterns it covers.
- **Campaign accuracy:** Multi-platform/multi-week campaign generation doesn't always hit its own stated post-count target (documented as a live-tested edge case in the audit). A corrective-retry mechanism was tried and removed because it doubled cost without fully closing the gap.
- **Code modularity:** Refactoring the Flask backend to better separate API routing from prompt-handling logic.

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

```bash
cd server
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
```

Start the backend:

```bash
python app.py
```

The Flask API runs on `http://localhost:5001`.

### 4. Install frontend dependencies

In a second terminal:

```bash
cd client
npm ci
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies `/api` requests to the Flask backend.

## Usage

1. Open `http://localhost:3000`.
2. Complete the brand/persona setup if no preferences have been saved yet.
3. Start a chat and request captions, post ideas, content briefs, or campaign planning.
4. Use the generated content cards to review, copy, regenerate, or refine content — every draft goes through this manual review step, there is no auto-posting integration.

## Project Structure

```text
├── client/          # React + Vite + Tailwind CSS
├── server/          # Flask + Anthropic API + SQLite history
├── docs/            # Technical audit, user manual, and change documentation
├── .gitignore
└── README.md
```
