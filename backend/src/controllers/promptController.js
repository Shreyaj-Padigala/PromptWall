const db = require('../config/database');
const { callGroundTruth, callTrainingModel } = require('../config/groq');
const orchestrator = require('../agents/orchestrator');
const promptGeneratorAgent = require('../agents/promptGeneratorAgent');

let promptMetadataSchemaReady = null;

function ensurePromptMetadataColumns(executor = db) {
  if (!promptMetadataSchemaReady) {
    promptMetadataSchemaReady = executor.query(`
      ALTER TABLE prompts
      ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS generation_reasoning TEXT,
      ADD COLUMN IF NOT EXISTS target_failure_mode VARCHAR(50),
      ADD COLUMN IF NOT EXISTS generation_difficulty VARCHAR(20)
    `).catch((err) => {
      promptMetadataSchemaReady = null;
      throw err;
    });
  }

  return promptMetadataSchemaReady;
}

async function getActiveSession(client, sessionId, userId) {
  const sessionResult = await client.query(
    `SELECT ts.*, tl.base_model
     FROM training_sessions ts
     JOIN training_llms tl ON ts.training_llm_id = tl.id
     WHERE ts.id = $1 AND ts.user_id = $2 AND ts.is_active = true`,
    [sessionId, userId]
  );

  return sessionResult.rows[0] || null;
}

function normalizePromptSource(source) {
  return source === 'auto_generated' ? 'auto_generated' : 'manual';
}

async function submitPrompt(req, res) {
  const {
    session_id,
    prompt_text,
    source,
    generation_reasoning,
    target_failure_mode,
    difficulty
  } = req.body;
  if (!session_id || !prompt_text || !prompt_text.trim()) {
    return res.status(400).json({ error: 'session_id and prompt_text are required' });
  }

  const client = await db.connect();
  let transactionStarted = false;
  try {
    await ensurePromptMetadataColumns(client);
    await client.query('BEGIN');
    transactionStarted = true;

    const session = await getActiveSession(client, session_id, req.user.id);
    if (!session) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active session not found' });
    }

    const trainingLlmId = session.training_llm_id;
    const promptSource = normalizePromptSource(source);

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
      `INSERT INTO prompts (session_id, text, ground_truth_label, source, generation_reasoning, target_failure_mode, generation_difficulty)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        session_id,
        prompt_text.trim(),
        groundTruth.classification,
        promptSource,
        promptSource === 'auto_generated' ? (generation_reasoning || null) : null,
        promptSource === 'auto_generated' ? (target_failure_mode || null) : null,
        promptSource === 'auto_generated' ? (difficulty || null) : null
      ]
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
      prompt: {
        id: prompt.id,
        text: prompt_text,
        ground_truth_label: groundTruth.classification,
        source: prompt.source,
        generation_reasoning: prompt.generation_reasoning,
        target_failure_mode: prompt.target_failure_mode,
        difficulty: prompt.generation_difficulty
      },
      training_response: { classification: trainingResponse.classification, reasoning: trainingResponse.reasoning },
      ground_truth: { classification: groundTruth.classification, reasoning: groundTruth.reasoning },
      evaluation: { is_correct: isCorrect, error_type: errorType },
      performance: { prompt_number: total, accuracy: parseFloat(accuracy.toFixed(1)) },
      insight: orchestratorResult.insight?.keyTakeaway || null,
      agents: orchestratorResult.agents
    });
  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('Submit prompt error:', err.message);
    res.status(500).json({ error: 'Failed to process prompt. Check your Groq API key and model availability.' });
  } finally {
    client.release();
  }
}

async function generateNextPrompt(req, res) {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    await ensurePromptMetadataColumns();
    const sessionResult = await db.query(
      `SELECT ts.*, tl.base_model
       FROM training_sessions ts
       JOIN training_llms tl ON ts.training_llm_id = tl.id
       WHERE ts.id = $1 AND ts.user_id = $2 AND ts.is_active = true`,
      [session_id, req.user.id]
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const trainingLlmId = session.training_llm_id;

    const [knowledgeResult, insightsResult, recentPromptsResult, errorDistributionResult] = await Promise.all([
      db.query(
        'SELECT knowledge_summary FROM training_knowledge WHERE training_llm_id = $1',
        [trainingLlmId]
      ),
      db.query(
        `SELECT li.key_takeaway
         FROM learning_insights li
         JOIN prompts p ON li.prompt_id = p.id
         JOIN training_sessions ts ON p.session_id = ts.id
         WHERE ts.training_llm_id = $1
         ORDER BY li.created_at DESC
         LIMIT 8`,
        [trainingLlmId]
      ),
      db.query(
        `SELECT p.text, p.source, p.ground_truth_label, e.error_type, e.is_correct
         FROM prompts p
         LEFT JOIN evaluations e ON e.prompt_id = p.id
         JOIN training_sessions ts ON p.session_id = ts.id
         WHERE ts.training_llm_id = $1
         ORDER BY p.created_at DESC
         LIMIT 8`,
        [trainingLlmId]
      ),
      db.query(
        `SELECT
          COUNT(*) FILTER (WHERE e.error_type = 'false_positive') AS false_positive,
          COUNT(*) FILTER (WHERE e.error_type = 'false_negative') AS false_negative,
          COUNT(*) FILTER (WHERE e.is_correct = true) AS correct,
          COUNT(*) AS total
         FROM evaluations e
         JOIN prompts p ON e.prompt_id = p.id
         JOIN training_sessions ts ON p.session_id = ts.id
         WHERE ts.training_llm_id = $1`,
        [trainingLlmId]
      )
    ]);

    const generated = await promptGeneratorAgent.run({
      knowledgeSummary: knowledgeResult.rows[0]?.knowledge_summary || '',
      recentInsights: insightsResult.rows.map((row) => row.key_takeaway),
      recentPrompts: recentPromptsResult.rows,
      errorDistribution: errorDistributionResult.rows[0] || {},
      baseModel: session.base_model
    });

    res.json(generated);
  } catch (err) {
    console.error('Generate prompt error:', err.message);
    res.status(500).json({ error: 'Failed to generate prompt. Check your Groq API key and model availability.' });
  }
}

async function getPrompt(req, res) {
  try {
    await ensurePromptMetadataColumns();
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

module.exports = { submitPrompt, generateNextPrompt, getPrompt };
