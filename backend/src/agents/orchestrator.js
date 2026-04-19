const { logAgent } = require('./learnAgent');
const learnAgent = require('./learnAgent');
const trainingKnowledgeAgent = require('./trainingKnowledgeAgent');

async function run({ promptId, isCorrect, trainingLlmId, promptText, trainingResponse, groundTruth, errorType }) {
  const decision = isCorrect
    ? 'Monitor only — model answered correctly'
    : 'Activate Learn Agent and Training Knowledge Agent — model answered incorrectly';

  await logAgent(
    promptId,
    'orchestrator',
    true,
    decision,
    `Evaluation result: ${isCorrect ? 'CORRECT' : 'INCORRECT'}. ${isCorrect ? 'No agent intervention needed.' : 'Delegating to Learn Agent for insight extraction, then to Training Knowledge Agent for knowledge update.'}`
  );

  let insight = null;

  if (!isCorrect) {
    insight = await learnAgent.run({ promptId, promptText, trainingResponse, groundTruth, errorType });
    await trainingKnowledgeAgent.run({ trainingLlmId, promptId });
  } else {
    await logAgent(promptId, 'learn_agent', false, 'Skipped', 'Model was correct — no learning intervention needed');
    await logAgent(promptId, 'training_knowledge_agent', false, 'Skipped', 'Model was correct — no knowledge update needed');
  }

  return {
    agents: {
      orchestrator: { active: true, decision },
      learn_agent: { active: !isCorrect },
      training_knowledge_agent: { active: !isCorrect }
    },
    insight
  };
}

module.exports = { run };
