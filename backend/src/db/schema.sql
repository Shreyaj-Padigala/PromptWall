-- PromptWall Database Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_llms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_model VARCHAR(255) NOT NULL DEFAULT 'llama-3.1-8b-instant',
  skill_level FLOAT DEFAULT 0.0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  training_llm_id INTEGER REFERENCES training_llms(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS prompts (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES training_sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  ground_truth_label VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_responses (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  response_type VARCHAR(50) NOT NULL,
  classification VARCHAR(50) NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  confidence_score FLOAT,
  error_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL,
  was_active BOOLEAN NOT NULL,
  decision TEXT,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_insights (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
  what_went_wrong TEXT,
  why_it_was_wrong TEXT,
  key_takeaway TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_knowledge (
  id SERIAL PRIMARY KEY,
  training_llm_id INTEGER UNIQUE REFERENCES training_llms(id) ON DELETE CASCADE,
  knowledge_summary TEXT DEFAULT '',
  current_accuracy FLOAT DEFAULT 0,
  total_prompts INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_tracking (
  id SERIAL PRIMARY KEY,
  training_llm_id INTEGER REFERENCES training_llms(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES training_sessions(id) ON DELETE CASCADE,
  prompt_number INTEGER NOT NULL,
  accuracy FLOAT NOT NULL,
  correct_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
