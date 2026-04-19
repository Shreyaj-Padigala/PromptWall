const { callPromptGenerator } = require('../config/groq');

async function run({ knowledgeSummary, recentInsights, recentPrompts, errorDistribution, baseModel }) {
  return callPromptGenerator({
    knowledgeSummary,
    recentInsights,
    recentPrompts,
    errorDistribution,
    baseModel
  });
}

module.exports = { run };
