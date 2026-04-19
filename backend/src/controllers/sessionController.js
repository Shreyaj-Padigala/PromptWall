const db = require('../config/database');

async function createSession(req, res) {
  const { training_llm_id } = req.body;
  if (!training_llm_id) return res.status(400).json({ error: 'training_llm_id is required' });

  try {
    const modelCheck = await db.query(
      'SELECT id FROM training_llms WHERE id = $1 AND user_id = $2',
      [training_llm_id, req.user.id]
    );
    if (!modelCheck.rows[0]) return res.status(404).json({ error: 'Model not found' });

    const existing = await db.query(
      'SELECT id FROM training_sessions WHERE user_id = $1 AND training_llm_id = $2 AND is_active = true',
      [req.user.id, training_llm_id]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An active session already exists for this model', session_id: existing.rows[0].id });
    }

    const result = await db.query(
      'INSERT INTO training_sessions (user_id, training_llm_id) VALUES ($1, $2) RETURNING *',
      [req.user.id, training_llm_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create session error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function listSessions(req, res) {
  try {
    const result = await db.query(
      `SELECT ts.*, tl.name as model_name, tl.base_model,
        COUNT(p.id) as prompt_count,
        COALESCE(
          (SELECT pt.accuracy FROM performance_tracking pt
           WHERE pt.session_id = ts.id
           ORDER BY pt.created_at DESC LIMIT 1), 0
        ) as final_accuracy
       FROM training_sessions ts
       JOIN training_llms tl ON ts.training_llm_id = tl.id
       LEFT JOIN prompts p ON p.session_id = ts.id
       WHERE ts.user_id = $1
       GROUP BY ts.id, tl.name, tl.base_model
       ORDER BY ts.started_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List sessions error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSession(req, res) {
  try {
    const sessionResult = await db.query(
      `SELECT ts.*, tl.name as model_name, tl.base_model
       FROM training_sessions ts
       JOIN training_llms tl ON ts.training_llm_id = tl.id
       WHERE ts.id = $1 AND ts.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!sessionResult.rows[0]) return res.status(404).json({ error: 'Session not found' });

    const session = sessionResult.rows[0];

    const promptsResult = await db.query(
      `SELECT p.*,
        mr_t.classification as training_classification,
        mr_t.explanation as training_explanation,
        mr_gt.classification as gt_classification,
        mr_gt.explanation as gt_explanation,
        e.is_correct, e.error_type,
        li.key_takeaway
       FROM prompts p
       LEFT JOIN model_responses mr_t ON mr_t.prompt_id = p.id AND mr_t.response_type = 'training'
       LEFT JOIN model_responses mr_gt ON mr_gt.prompt_id = p.id AND mr_gt.response_type = 'ground_truth'
       LEFT JOIN evaluations e ON e.prompt_id = p.id
       LEFT JOIN learning_insights li ON li.prompt_id = p.id
       WHERE p.session_id = $1
       ORDER BY p.created_at ASC`,
      [req.params.id]
    );

    res.json({ ...session, prompts: promptsResult.rows });
  } catch (err) {
    console.error('Get session error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function endSession(req, res) {
  try {
    const result = await db.query(
      `UPDATE training_sessions SET is_active = false, ended_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_active = true
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Active session not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createSession, listSessions, getSession, endSession };
