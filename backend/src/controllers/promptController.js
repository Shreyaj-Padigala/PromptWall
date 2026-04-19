const db = require('../config/database');
const { callGroundTruth, callTrainingModel } = require('../config/groq');
const orchestrator = require('../agents/orchestrator');

async function submitPrompt(req, res) {
  const { session_id, prompt_text } = req.body;
  if (!session_id || !prompt_text || !prompt_text.trim()) {
    return res.status(400).json({ error: 'session_id and prompt_text are required' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `SELECT ts.*, tl.base_model
       FROM training_sessions ts
       JOIN training_llms tl ON ts.training_llm_id = tl.id
       WHERE ts.id = $1 AND ts.user_id = $2 AND ts.is_active = true`,
      [session_id, req.user.id]
    );
    if (!sessionResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active session not found' });
    }

    const session = sessionResult.rows[0];
    const trainingLlmId = session.training_llm_id;

    const knowledgeResult = await client.query(
      'SELECT knowledge_summary FROM training_knowledge WHERE training_llm_id = $1',
      [trainingLlmId]
    );
    const knowledgeSummary = knowledgeResult.rows[0]?.knowledge_summary || '';

    const [groundTruth, trainingResponse] = await Promise.all([
      callGroundTruth(prompt_text),
      callTrainingModel(prompt_text, knowledgeSummary, session.base_model)
    ]);

    const promptResult = await client.query(
      'INSERT INTO prompts (session_id, text, ground_truth_label) VALUES ($1, $2, $3) RETURNING *',
      [session_id, prompt_text.trim(), groundTruth.classification]
    );
    const prompt = promptResult.rows[0];

    await client.query(
      'INSERT INTO model_responses (prompt_id, response_type, classification, explanation) VALUES ($1, $2, $3, $4)',
      [prompt.id, 'ground_truth', groundTruth.classification, groundTruth.reasoning]
    );
    await client.query(
      'INSERT INTO model_responses (prompt_id, response_type, classification, explanation) VALUES ($1, $2, $3, $4)',
      [prompt.id, 'training', trainingResponse.classification, trainingResponse.reasoning]
    );

    const isCorrect = trainingResponse.classification === groundTruth.classification;
    const errorType = !isCorrect
      ? (trainingResponse.classification === 'injection' ? 'false_positive' : 'false_negative')
      : null;

    await client.query(
      'INSERT INTO evaluations (prompt_id, is_correct, error_type) VALUES ($1, $2, $3)',
      [prompt.id, isCorrect, errorType]
    );

    const countResult = await client.query(
      `SELECT
        COUNT(*) FILTER (WHERE e.is_correct = true) as correct,
        COUNT(*) as total
       FROM evaluations e
       JOIN prompts p ON e.prompt_id = p.id
       JOIN training_sessions ts ON p.session_id = ts.id
       WHERE ts.training_llm_id = $1`,
      [trainingLlmId]
    );
    const correct = parseInt(countResult.rows[0].correct);
    const total = parseInt(countResult.rows[0].total);
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    await client.query(
      'INSERT INTO performance_tracking (training_llm_id, session_id, prompt_number, accuracy, correct_count) VALUES ($1, $2, $3, $4, $5)',
      [trainingLlmId, session_id, total, accuracy, correct]
    );

    await client.query(
      `INSERT INTO training_knowledge (training_llm_id, knowledge_summary, current_accuracy, total_prompts, total_correct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (training_llm_id) DO UPDATE
       SET current_accuracy = $3, total_prompts = $4, total_correct = $5, updated_at = NOW()`,
      [trainingLlmId, knowledgeSummary, accuracy, total, correct]
    );

    await client.query(
      'UPDATE training_llms SET skill_level = $1 WHERE id = $2',
      [accuracy, trainingLlmId]
    );

    await client.query('COMMIT');

    const orchestratorResult = await orchestrator.run({
      promptId: prompt.id,
      isCorrect,
      trainingLlmId,
      promptText: prompt_text,
      trainingResponse,
      groundTruth,
      errorType
    });

    res.json({
      prompt: { id: prompt.id, text: prompt_text, ground_truth_label: groundTruth.classification },
      training_response: { classification: trainingResponse.classification, reasoning: trainingResponse.reasoning },
      ground_truth: { classification: groundTruth.classification, reasoning: groundTruth.reasoning },
      evaluation: { is_correct: isCorrect, error_type: errorType },
      performance: { prompt_number: total, accuracy: parseFloat(accuracy.toFixed(1)) },
      insight: orchestratorResult.insight?.keyTakeaway || null,
      agents: orchestratorResult.agents
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit prompt error:', err.message);
    res.status(500).json({ error: 'Failed to process prompt. Check your Groq API key and model availability.' });
  } finally {
    client.release();
  }
}

async function getPrompt(req, res) {
  try {
    const result = await db.query(
      `SELECT p.*,
        mr_t.classification as training_classification,
        mr_t.explanation as training_explanation,
        mr_gt.classification as gt_classification,
        mr_gt.explanation as gt_explanation,
        e.is_correct, e.error_type,
        li.key_takeaway,
        json_agg(al.*) FILTER (WHERE al.id IS NOT NULL) as agent_logs
       FROM prompts p
       LEFT JOIN model_responses mr_t ON mr_t.prompt_id = p.id AND mr_t.response_type = 'training'
       LEFT JOIN model_responses mr_gt ON mr_gt.prompt_id = p.id AND mr_gt.response_type = 'ground_truth'
       LEFT JOIN evaluations e ON e.prompt_id = p.id
       LEFT JOIN learning_insights li ON li.prompt_id = p.id
       LEFT JOIN agent_logs al ON al.prompt_id = p.id
       JOIN training_sessions ts ON p.session_id = ts.id
       WHERE p.id = $1 AND ts.user_id = $2
       GROUP BY p.id, mr_t.classification, mr_t.explanation, mr_gt.classification, mr_gt.explanation, e.is_correct, e.error_type, li.key_takeaway`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Prompt not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { submitPrompt, getPrompt };
