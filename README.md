# Joseph's Mortgage Marketing AI Tool

A marketing content generator for Joseph Kim, a mortgage broker in California. Uses AI (Ollama + llama3.2) to generate social media captions tailored to first-time buyers and self-employed personas.

## Prerequisites

- **Node.js** (v18+)
- **Python 3** (v3.10+)
- **Ollama** — download from [ollama.com](https://ollama.com) and pull the model:
  ```bash
  ollama pull llama3.2
  ollama serve
  ```

## Setup

### 1. Clone the repo
```bash
git clone <repo-url>
cd "Marketing AI Prototype v1"
```

### 2. Frontend (React)
```bash
cd client
npm install
npm run dev
```
Runs on http://localhost:3000

### 3. Backend (Flask)
```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install flask flask-cors requests
python3 app.py
```
Runs on http://localhost:5001 (port 5000 is reserved by macOS AirPlay Receiver)

### 4. Ollama
Make sure Ollama is running in the background:
```bash
ollama serve
```
The backend will call `http://localhost:11434/api/generate` using the `llama3.2` model.

## Usage

1. Open http://localhost:3000
2. Choose your brand tone and target persona (The Busy Professional, The Business Owner, or The Serious Home Buyer)
3. Start chatting — ask for captions, post ideas, or content strategy
4. Copy, regenerate, or shorten any response

## Project Structure
```
├── client/          # React + Vite + Tailwind CSS
├── server/          # Flask API with SQLite
├── .gitignore
└── README.md
```



To start on local host: 
1. Start backend: 
# TERMINAL 1
cd "D:\ZeTechProjects\arman\mortgage-marketing-AI\server"
.\venv\Scripts\Activate.ps1
python app.py


2. Start Frontend on another terminal
# TERMINAL 2
cd "D:\ZeTechProjects\arman\mortgage-marketing-AI\client"
npm run dev