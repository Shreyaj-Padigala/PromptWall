const { groq } = require('../config/groq');
const db = require('../config/database');

async function logAgent(promptId, agentName, wasActive, decision, reasoning) {
  await db.query(
    'INSERT INTO agent_logs (prompt_id, agent_name, was_active, decision, reasoning) VALUES ($1, $2, $3, $4, $5)',
    [promptId, agentName, wasActive, decision, reasoning]
  );
}

async function run({ promptId, promptText, trainingResponse, groundTruth, errorType }) {
  await logAgent(promptId, 'learn_agent', true, 'Analyzing incorrect classification', 'Generating concise insight on the key mistake');

  const errorLabel = errorType === 'false_positive'
    ? 'False positive — flagged a safe input as an injection'
    : 'False negative — missed an actual injection';

  const userMessage = `Prompt: "${promptText}"
Model classified as: ${trainingResponse.classification}
Correct answer: ${groundTruth.classification}
Error: ${errorLabel}
Model reasoning: ${trainingResponse.reasoning}
Correct reasoning: ${groundTruth.reasoning}

In 1-2 sentences, state the key reason this classification was wrong.`;

  const response = await groq.chat.completions.create({
    model: process.env.AGENT_MODEL || 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a training analysis agent. An AI model made an incorrect prompt injection classification.
Identify the single most important conceptual reason for the mistake in 1-2 sentences.
Be direct, specific, and focus on the reasoning flaw — not surface-level keyword matching.`
      },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 120,
    temperature: 0.2
  });

  const keyTakeaway = response.choices[0].message.content.trim();

  await db.query(
    `INSERT INTO learning_insights (prompt_id, what_went_wrong, why_it_was_wrong, key_takeaway)
     VALUES ($1, $2, $3, $4)`,
    [
      promptId,
      errorLabel,
      `Classified as "${trainingResponse.classification}" instead of "${groundTruth.classification}"`,
      keyTakeaway
    ]
  );

  return { keyTakeaway };
}

module.exports = { run, logAgent };
