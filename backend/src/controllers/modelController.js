const db = require('../config/database');

async function listModels(req, res) {
  try {
    const result = await db.query(
      `SELECT tl.*, tk.current_accuracy, tk.total_prompts, tk.total_correct, tk.knowledge_summary
       FROM training_llms tl
       LEFT JOIN training_knowledge tk ON tl.id = tk.training_llm_id
       WHERE tl.user_id = $1
       ORDER BY tl.created_at ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List models error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getModel(req, res) {
  try {
    const result = await db.query(
      `SELECT tl.*, tk.current_accuracy, tk.total_prompts, tk.total_correct, tk.knowledge_summary, tk.updated_at as knowledge_updated_at
       FROM training_llms tl
       LEFT JOIN training_knowledge tk ON tl.id = tk.training_llm_id
       WHERE tl.id = $1 AND tl.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Model not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getModelPerformance(req, res) {
  try {
    const modelCheck = await db.query(
      'SELECT id FROM training_llms WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!modelCheck.rows[0]) return res.status(404).json({ error: 'Model not found' });

    const result = await db.query(
      `SELECT pt.prompt_number, pt.accuracy, pt.correct_count, pt.created_at, ts.id as session_id
       FROM performance_tracking pt
       JOIN training_sessions ts ON pt.session_id = ts.id
       WHERE pt.training_llm_id = $1
       ORDER BY pt.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { listModels, getModel, getModelPerformance };
