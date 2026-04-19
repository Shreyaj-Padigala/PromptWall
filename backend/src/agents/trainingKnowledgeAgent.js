const { groq } = require('../config/groq');
const db = require('../config/database');
const { logAgent } = require('./learnAgent');

async function run({ trainingLlmId, promptId }) {
  await logAgent(promptId, 'training_knowledge_agent', true, 'Updating model knowledge', 'Synthesizing insights into improved detection rules');

  const insightsResult = await db.query(
    `SELECT li.key_takeaway
     FROM learning_insights li
     JOIN prompts p ON li.prompt_id = p.id
     JOIN training_sessions ts ON p.session_id = ts.id
     WHERE ts.training_llm_id = $1
     ORDER BY li.created_at DESC
     LIMIT 20`,
    [trainingLlmId]
  );

  const insights = insightsResult.rows.map(r => r.key_takeaway);
  if (insights.length === 0) return;

  const response = await groq.chat.completions.create({
    model: process.env.AGENT_MODEL || 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a training knowledge aggregation agent for an AI learning to detect prompt injections.
Synthesize the provided learning insights into at most 5 concise rules.
Each rule must be 1-2 sentences. Format as a numbered list.
Focus on conceptual patterns, not surface keywords. Be specific and actionable.`
      },
      {
        role: 'user',
        content: `Mistakes made so far:\n${insights.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nSynthesize these into key detection rules.`
      }
    ],
    max_tokens: 350,
    temperature: 0.2
  });

  const knowledgeSummary = response.choices[0].message.content.trim();

  await db.query(
    `INSERT INTO training_knowledge (training_llm_id, knowledge_summary, current_accuracy, total_prompts, total_correct)
     VALUES ($1, $2, 0, 0, 0)
     ON CONFLICT (training_llm_id) DO UPDATE SET knowledge_summary = $2, updated_at = NOW()`,
    [trainingLlmId, knowledgeSummary]
  );
}

module.exports = { run };
