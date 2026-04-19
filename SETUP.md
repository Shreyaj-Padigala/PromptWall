# PromptWall — Local Development Setup

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ running locally
- A Groq API key (get one at console.groq.com)

---

## 1. Clone and install dependencies

```bash
cd backend
npm install
```

---

## 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp ../.env.example backend/.env
```

Open `backend/.env` and set:

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default `3000`) |
| `PGUSER` | PostgreSQL username |
| `PGPASSWORD` | PostgreSQL password |
| `PGHOST` | PostgreSQL host (default `localhost`) |
| `PGPORT` | PostgreSQL port (default `5432`) |
| `PGDATABASE` | Database name (e.g. `promptwall`) |
| `JWT_SECRET` | Any long random string for signing JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `GROQ_API_KEY` | Your Groq API key |
| `TRAINING_MODEL` | Groq model for the training LLM (default `llama-3.1-8b-instant`) |
| `GROUND_TRUTH_MODEL` | Groq model for ground truth (default `llama-3.3-70b-versatile`) |
| `AGENT_MODEL` | Groq model for agents (default `llama-3.3-70b-versatile`) |

---

## 3. Create the PostgreSQL database

```bash
psql -U postgres -c "CREATE DATABASE promptwall;"
```

Then run the schema:

```bash
psql -U postgres -d promptwall -f backend/src/db/schema.sql
```

Or use the npm script (requires environment to be set):

```bash
cd backend && npm run db:init
```

---

## 4. Start the server

Development mode (auto-restarts on file changes):

```bash
cd backend
npm run dev
```

Production mode:

```bash
cd backend
npm start
```

The server starts at **http://localhost:3000**

---

## 5. Access the application

| URL | Page |
|---|---|
| `http://localhost:3000/` | Login / Sign up |
| `http://localhost:3000/dashboard.html` | Training Dashboard |
| `http://localhost:3000/model.html?id=1` | Model Performance Graph |
| `http://localhost:3000/sessions.html` | Past Sessions |
| `http://localhost:3000/api-docs` | Swagger API Documentation |

---

## Architecture

```
backend/
├── public/              # Frontend (HTML/CSS/JS) — served as static files
│   ├── index.html       # Login / Sign up
│   ├── dashboard.html   # Main training interface
│   ├── model.html       # Per-model learning curve
│   ├── sessions.html    # Past sessions viewer
│   ├── css/style.css
│   └── js/
│       ├── api.js       # Fetch wrapper + auth helpers
│       ├── auth.js
│       ├── dashboard.js
│       ├── model.js
│       └── sessions.js
└── src/
    ├── app.js           # Express app setup
    ├── config/
    │   ├── database.js  # PostgreSQL pool
    │   └── groq.js      # Groq API calls (ground truth + training model)
    ├── agents/
    │   ├── orchestrator.js              # Decides which agents run
    │   ├── learnAgent.js                # Generates insight on mistakes
    │   └── trainingKnowledgeAgent.js    # Updates model's knowledge base
    ├── controllers/     # Route handlers
    ├── middleware/      # JWT authentication
    ├── routes/          # Express routes + Swagger JSDoc
    └── db/schema.sql    # Full database schema
```

---

## Agent Workflow

When a prompt is submitted:

1. **Ground Truth Model** (Groq, expert classifier system prompt) — produces the correct answer
2. **Training Model** (Groq, novice system prompt + optional accumulated knowledge) — produces the training answer
3. **Evaluation** — compares both answers
4. **Orchestrator** — decides which agents activate:
   - If **correct**: logs and moves on
   - If **incorrect**:
     - **Learn Agent** activates → generates 1–2 sentence insight on why the model was wrong
     - **Training Knowledge Agent** activates → synthesizes all insights into updated detection rules, which are injected into the training model's system prompt on the next prompt
5. **Performance Tracking** — records accuracy at this prompt number for the graph

---

## Demo Flow

1. Sign up — two training LLMs are auto-provisioned (`PromptWall v0.1`, `PromptWall v0.2`)
2. Select a model from the dropdown on the Dashboard
3. Click **Start Session**
4. Enter prompts — try safe ones and actual injection attempts
5. Watch the model improve over time on the model's performance page
6. End the session when done; view it in Past Sessions
