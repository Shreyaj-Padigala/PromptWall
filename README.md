# PromptWall

A full-stack agentic AI platform that trains language models to detect prompt injection attacks in real time. Built to demonstrate how autonomous agent workflows can iteratively improve an LLM's ability to distinguish malicious inputs from safe ones — without human intervention.

---

## What it does

Users submit natural language prompts to a "training LLM." A multi-agent system evaluates each response, identifies mistakes, extracts learning insights, and continuously updates the model's detection knowledge. Over a session, the training model gets measurably better at catching prompt injections.

The learning curve for each model is tracked and visualized as accuracy improves across prompts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| LLM | Groq API |
| Frontend | HTML, CSS, Vanilla JS |
| Auth | JWT |
| API Docs | Swagger (OpenAPI 3.0) |

---

## Agent Workflow

Every prompt submission runs through a three-agent pipeline:

```
User Prompt
    │
    ├── Ground Truth Model  (Groq — expert classifier, no prior context)
    └── Training Model      (Groq — novice system prompt + accumulated knowledge)
                │
                ▼
         Evaluation: Correct?
                │
     ┌──────────┴──────────┐
   Yes                     No
     │                     │
  Log only           Orchestrator activates:
                     ├── Learn Agent
                     │   └── 1-2 sentence insight on WHY it was wrong
                     └── Training Knowledge Agent
                         └── Synthesizes all insights into updated detection rules
                             (injected into training model's system prompt next prompt)
```

**Orchestrator** — always active, decides which agents run based on evaluation result.

**Learn Agent** — active only on incorrect answers. Generates a concise, specific insight about the conceptual error — not keyword surface-level, but the actual reasoning flaw.

**Training Knowledge Agent** — active only on incorrect answers. Aggregates all insights from the session into a numbered rule set (max 5 rules) that becomes the model's persistent training context.

---

## Pages

| Route | Description |
|---|---|
| `/` | Login / Sign up |
| `/dashboard.html` | Main training interface — submit prompts, view live results and agent activity |
| `/model.html?id=X` | Per-model learning curve graph + accumulated training knowledge |
| `/sessions.html` | History of all past sessions with prompt-level detail |
| `/api-docs` | Swagger API documentation |

---

## Database Schema

```
users
training_llms          ← 2 demo models auto-provisioned on signup
training_sessions      ← user-controlled start/end
prompts                ← stores text + ground truth label
model_responses        ← training and ground truth responses per prompt
evaluations            ← correct/incorrect + error type (FP / FN)
agent_logs             ← activity record for each agent per prompt
learning_insights      ← learn agent output (only on mistakes)
training_knowledge     ← persisted model knowledge state (unique per model)
performance_tracking   ← accuracy at each prompt number (powers the graph)
```

---

## Setup

See [SETUP.md](SETUP.md) for full instructions.

Quick start:

```bash
# 1. Create the database
psql -U postgres -c "CREATE DATABASE promptwall;"
psql -U postgres -d promptwall -f backend/src/db/schema.sql

# 2. Configure environment
cp .env.example backend/.env
# Fill in PGPASSWORD, JWT_SECRET, and GROQ_API_KEY

# 3. Install and run
cd backend
npm install
npm run dev
```

Open `http://localhost:3000`

---

## Example of Environment Variables

**Local development** — use individual Postgres vars:

```env
PORT=3000
PGUSER=postgres
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
PGDATABASE=promptwall
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
GROQ_API_KEY=your_groq_api_key
TRAINING_MODEL=llama-3.1-8b-instant
GROUND_TRUTH_MODEL=llama-3.3-70b-versatile
AGENT_MODEL=llama-3.3-70b-versatile
```

**Render / production** — use `DATABASE_URL` instead of the individual `PG*` vars:

```env
DATABASE_URL=postgresql://user:password@host:5432/promptwall
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
GROQ_API_KEY=your_groq_api_key
TRAINING_MODEL=llama-3.1-8b-instant
GROUND_TRUTH_MODEL=llama-3.3-70b-versatile
AGENT_MODEL=llama-3.3-70b-versatile
```

When `DATABASE_URL` is set it takes priority over the individual `PG*` variables.

---

## Deploying to Render

1. Create a **Render Postgres** database and link it to your web service — Render auto-sets `DATABASE_URL`
2. Add `GROQ_API_KEY`, `JWT_SECRET`, and any model overrides in the Render environment dashboard
3. Set **Root Directory** to `backend` and **Start Command** to `node src/server.js`

---

## Project Structure

```
PromptWall/
├── backend/
│   ├── public/                  # Frontend static files
│   │   ├── index.html
│   │   ├── dashboard.html
│   │   ├── model.html
│   │   ├── sessions.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── api.js
│   │       ├── auth.js
│   │       ├── dashboard.js
│   │       ├── model.js
│   │       └── sessions.js
│   ├── src/
│   │   ├── agents/
│   │   │   ├── orchestrator.js
│   │   │   ├── learnAgent.js
│   │   │   └── trainingKnowledgeAgent.js
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── groq.js
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── db/schema.sql
│   ├── server.js
│   └── package.json
├── .env.example
├── SETUP.md
└── README.md
```
