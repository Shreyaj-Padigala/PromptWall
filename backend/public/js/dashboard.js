if (!requireAuth()) throw new Error('Not authenticated');

const AUTO_RUN_DELAY_MS = 5000;

let models = [];
let activeSession = null;
let promptHistory = [];
let pendingGeneratedPrompt = null;
let isGenerating = false;
let isSubmitting = false;
let autoRunEnabled = false;
let autoRunTimer = null;
let autoRunCountdownTimer = null;

const modelSelect = document.getElementById('model-select');
const sessionDot = document.getElementById('session-dot');
const sessionStatus = document.getElementById('session-status');
const startBtn = document.getElementById('start-btn');
const endBtn = document.getElementById('end-btn');
const promptModeSelect = document.getElementById('prompt-mode');
const generateBtn = document.getElementById('generate-btn');
const generateBtnText = document.getElementById('generate-btn-text');
const autoStatus = document.getElementById('auto-status');
const generatedMeta = document.getElementById('generated-meta');
const generatedTargetChip = document.getElementById('generated-target-chip');
const generatedDifficultyChip = document.getElementById('generated-difficulty-chip');
const generatedReasoning = document.getElementById('generated-reasoning');
const promptInput = document.getElementById('prompt-input');
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeLoading = document.getElementById('analyze-loading');

async function init() {
  const user = getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();
  }

  try {
    models = await api.models.list();
    populateModelSelect();
    populateNavModels();

    const sessions = await api.sessions.list();
    const active = sessions.find((session) => session.is_active);
    if (active) {
      activeSession = active;
      const model = models.find((entry) => entry.id === active.training_llm_id);
      if (model) modelSelect.value = model.id;
      setSessionActive(true, active.id);
    }
  } catch (err) {
    console.error(err);
  }

  updatePromptControls();
}

function populateModelSelect() {
  modelSelect.innerHTML = '<option value="">Select model...</option>';
  models.forEach((model) => {
    const opt = document.createElement('option');
    opt.value = model.id;
    opt.textContent = model.name;
    modelSelect.appendChild(opt);
  });
}

function populateNavModels() {
  const container = document.getElementById('nav-models-list');
  container.innerHTML = '';
  models.forEach((model) => {
    const a = document.createElement('a');
    a.href = `/model.html?id=${model.id}`;
    a.className = 'nav-item nav-sub-item';
    a.innerHTML = `<span>${model.name}</span>`;
    container.appendChild(a);
  });
}

function getPromptMode() {
  return promptModeSelect.value || 'manual';
}

function clearAutoTimers() {
  if (autoRunTimer) {
    clearTimeout(autoRunTimer);
    autoRunTimer = null;
  }
  if (autoRunCountdownTimer) {
    clearInterval(autoRunCountdownTimer);
    autoRunCountdownTimer = null;
  }
}

function setAutoStatus(text) {
  autoStatus.textContent = text;
}

function setGeneratedPromptMeta(meta) {
  if (!meta || meta.source !== 'auto_generated') {
    pendingGeneratedPrompt = null;
    generatedMeta.style.display = 'none';
    generatedReasoning.textContent = '';
    return;
  }

  pendingGeneratedPrompt = meta;
  generatedTargetChip.textContent = meta.target_failure_mode || 'exploration';
  generatedDifficultyChip.textContent = meta.difficulty || 'medium';
  generatedReasoning.textContent = meta.generation_reasoning || 'AI-generated prompt focused on current weaknesses.';
  generatedMeta.style.display = '';
}

function stopAutoRun(statusText = 'Auto mode idle.') {
  autoRunEnabled = false;
  clearAutoTimers();
  setAutoStatus(statusText);
  updatePromptControls();
}

function scheduleNextAutoRun(result) {
  if (!autoRunEnabled || !activeSession || getPromptMode() !== 'auto_run') return;

  const expected = result.ground_truth.classification;
  const actual = result.training_response.classification;
  let remainingSeconds = AUTO_RUN_DELAY_MS / 1000;

  setAutoStatus(`Observed result: expected ${expected}, model predicted ${actual}. Next automatic prompt in ${remainingSeconds}s.`);

  autoRunCountdownTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(autoRunCountdownTimer);
      autoRunCountdownTimer = null;
      return;
    }
    setAutoStatus(`Observed result: expected ${expected}, model predicted ${actual}. Next automatic prompt in ${remainingSeconds}s.`);
  }, 1000);

  autoRunTimer = setTimeout(() => {
    autoRunTimer = null;
    if (!autoRunEnabled || !activeSession || getPromptMode() !== 'auto_run') return;
    generatePrompt({ autoSubmit: true });
  }, AUTO_RUN_DELAY_MS);
}

function updatePromptControls() {
  const hasSession = Boolean(activeSession);
  const hasPromptText = promptInput.value.trim().length > 0;
  const autoRunning = autoRunEnabled && getPromptMode() === 'auto_run';

  startBtn.disabled = isGenerating || isSubmitting;
  endBtn.disabled = !hasSession || isGenerating || isSubmitting;
  promptModeSelect.disabled = !hasSession || autoRunning || isGenerating || isSubmitting;
  promptInput.disabled = !hasSession || autoRunning || isGenerating || isSubmitting;
  analyzeBtn.disabled = !hasSession || !hasPromptText || autoRunning || isGenerating || isSubmitting;
  generateBtn.disabled = !hasSession || ((isGenerating || isSubmitting) && !autoRunning);
  generateBtnText.textContent = autoRunning ? 'Stop Auto' : 'Auto Generate';

  if (!hasSession) {
    setAutoStatus('Auto mode idle.');
  } else if (!autoRunning && !isGenerating && !isSubmitting && getPromptMode() === 'manual') {
    setAutoStatus('Manual mode active.');
  } else if (!autoRunning && !isGenerating && !isSubmitting && getPromptMode() === 'review') {
    setAutoStatus('Review mode active. Generate a prompt, inspect it, then analyze.');
  }
}

function setSessionActive(active, sessionId) {
  if (active) {
    sessionDot.classList.add('active');
    sessionStatus.textContent = `Session #${sessionId} active`;
    sessionStatus.classList.add('active-text');
    startBtn.style.display = 'none';
    endBtn.style.display = '';
    document.getElementById('prompt-history').style.display = '';
  } else {
    stopAutoRun('Auto mode idle.');
    sessionDot.classList.remove('active');
    sessionStatus.textContent = 'No active session';
    sessionStatus.classList.remove('active-text');
    startBtn.style.display = '';
    endBtn.style.display = 'none';
    activeSession = null;
    promptInput.value = '';
    promptHistory = [];
    document.getElementById('history-list').innerHTML = '';
    setGeneratedPromptMeta(null);
  }

  updatePromptControls();
}

function onModelChange() {
  if (!activeSession) return;
}

async function startSession() {
  const modelId = parseInt(modelSelect.value, 10);
  if (!modelId) {
    alert('Select a training model first');
    return;
  }

  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="spinner"></span>';
  try {
    const session = await api.sessions.create({ training_llm_id: modelId });
    activeSession = session;
    promptHistory = [];
    promptInput.value = '';
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('results-section').style.display = 'none';
    setGeneratedPromptMeta(null);
    setSessionActive(true, session.id);
  } catch (err) {
    if (err.message.includes('active session')) {
      const sessions = await api.sessions.list();
      const existing = sessions.find((session) => session.is_active && session.training_llm_id === modelId);
      if (existing) {
        activeSession = existing;
        setSessionActive(true, existing.id);
      }
    } else {
      alert(err.message);
    }
  } finally {
    startBtn.disabled = false;
    startBtn.innerHTML = 'Start Session';
    updatePromptControls();
  }
}

async function endSession() {
  if (!activeSession) return;
  if (!confirm('End this training session?')) return;

  stopAutoRun('Auto mode stopped.');
  endBtn.disabled = true;
  try {
    await api.sessions.end(activeSession.id);
    setSessionActive(false);
    document.getElementById('results-section').style.display = 'none';
  } catch (err) {
    alert(err.message);
  } finally {
    endBtn.disabled = false;
    updatePromptControls();
  }
}

async function generatePrompt({ autoSubmit = false } = {}) {
  if (!activeSession || isGenerating || isSubmitting) return;

  isGenerating = true;
  updatePromptControls();
  setAutoStatus(autoSubmit ? 'Generating and submitting the next automatic prompt...' : 'Generating prompt from recent model weaknesses...');

  try {
    const generated = await api.prompts.generate({ session_id: activeSession.id });
    promptInput.value = generated.prompt_text;
    setGeneratedPromptMeta({
      ...generated,
      source: 'auto_generated'
    });

    if (autoSubmit) {
      isGenerating = false;
      updatePromptControls();
      await submitPrompt({ sourceOverride: 'auto_generated' });
    } else {
      updatePromptControls();
      setAutoStatus('Generated prompt ready for review.');
      promptInput.focus();
    }
  } catch (err) {
    stopAutoRun('Automatic prompting stopped after a generation error.');
    alert('Error: ' + err.message);
  } finally {
    if (isGenerating) {
      isGenerating = false;
      updatePromptControls();
    }
  }
}

async function submitPrompt({ sourceOverride } = {}) {
  const text = promptInput.value.trim();
  if (!text || !activeSession || isSubmitting || isGenerating) return;

  clearAutoTimers();
  isSubmitting = true;
  analyzeBtn.style.display = 'none';
  analyzeLoading.style.display = 'flex';
  updatePromptControls();

  const generatedMatch = pendingGeneratedPrompt && pendingGeneratedPrompt.prompt_text === text;
  const promptSource = sourceOverride || (generatedMatch ? 'auto_generated' : 'manual');
  const payload = {
    session_id: activeSession.id,
    prompt_text: text,
    source: promptSource
  };

  if (promptSource === 'auto_generated' && pendingGeneratedPrompt) {
    payload.generation_reasoning = pendingGeneratedPrompt.generation_reasoning;
    payload.target_failure_mode = pendingGeneratedPrompt.target_failure_mode;
    payload.difficulty = pendingGeneratedPrompt.difficulty;
  }

  try {
    const result = await api.prompts.submit(payload);
    renderResult(result);
    promptHistory.unshift({
      num: result.performance.prompt_number,
      text,
      prompt: result.prompt,
      result
    });
    renderHistory();
    promptInput.value = '';
    setGeneratedPromptMeta(null);

    if (autoRunEnabled && getPromptMode() === 'auto_run') {
      scheduleNextAutoRun(result);
    } else {
      setAutoStatus('Prompt analyzed. Review the expected vs actual classifications above.');
    }
  } catch (err) {
    stopAutoRun('Automatic prompting stopped after a submission error.');
    alert('Error: ' + err.message);
  } finally {
    isSubmitting = false;
    analyzeBtn.style.display = '';
    analyzeLoading.style.display = 'none';
    updatePromptControls();
    promptInput.focus();
  }
}

function renderResult(r) {
  const section = document.getElementById('results-section');
  section.style.display = '';

  const trainBadge = document.getElementById('training-badge');
  const gtBadge = document.getElementById('gt-badge');

  trainBadge.textContent = r.training_response.classification;
  trainBadge.className = `classification-badge ${r.training_response.classification}`;
  document.getElementById('training-reasoning').textContent = r.training_response.reasoning || '-';

  gtBadge.textContent = r.ground_truth.classification;
  gtBadge.className = `classification-badge ${r.ground_truth.classification}`;
  document.getElementById('gt-reasoning').textContent = r.ground_truth.reasoning || '-';

  const verdict = document.getElementById('eval-verdict');
  verdict.textContent = r.evaluation.is_correct ? 'Correct' : 'Incorrect';
  verdict.className = `correct-badge ${r.evaluation.is_correct ? 'correct' : 'incorrect'}`;

  const errorMap = { false_positive: 'False Positive', false_negative: 'False Negative' };
  document.getElementById('eval-error-type').textContent = errorMap[r.evaluation.error_type] || '';

  document.getElementById('current-accuracy').textContent = `${r.performance.accuracy.toFixed(1)}%`;
  document.getElementById('accuracy-meta').textContent = `prompt #${r.performance.prompt_number}`;

  renderAgents(r);

  if (r.insight) {
    document.getElementById('insight-block').style.display = '';
    document.getElementById('insight-text').textContent = r.insight;
  } else {
    document.getElementById('insight-block').style.display = 'none';
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderAgents(r) {
  const { agents } = r;

  setAgent('orchestrator', agents.orchestrator.active, 'Active - routing decision made');
  setAgent('learn', agents.learn_agent.active, agents.learn_agent.active ? 'Active - insight generated' : 'Skipped');
  setAgent('knowledge', agents.training_knowledge_agent.active, agents.training_knowledge_agent.active ? 'Active - knowledge updated' : 'Skipped');
}

function setAgent(name, active, text) {
  const row = document.getElementById(`agent-${name}`);
  const dot = row.querySelector('.agent-dot');
  const textEl = document.getElementById(`agent-${name}-text`);

  row.classList.toggle('active', active);
  dot.className = `agent-dot ${active ? 'active' : 'skip'}`;
  textEl.textContent = text;
}

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  promptHistory.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const isCorrect = item.result.evaluation.is_correct;
    const sourceLabel = item.prompt?.source === 'auto_generated' ? 'AI' : 'Manual';
    div.innerHTML = `
      <span class="history-num">#${item.num}</span>
      <span class="history-text">${escapeHtml(item.text)}</span>
      <div class="history-badges">
        <span class="generated-chip">${sourceLabel}</span>
        <span class="classification-badge ${item.result.ground_truth.classification}" style="font-size:10px;padding:2px 6px">${item.result.ground_truth.classification}</span>
        <span class="correct-badge ${isCorrect ? 'correct' : 'incorrect'}" style="font-size:10px">${isCorrect ? 'OK' : 'X'}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function handleGenerateClick() {
  if (!activeSession) return;

  if (getPromptMode() === 'auto_run') {
    if (autoRunEnabled) {
      stopAutoRun('Automatic prompting stopped.');
      return;
    }

    autoRunEnabled = true;
    updatePromptControls();
    generatePrompt({ autoSubmit: true });
    return;
  }

  generatePrompt();
}

function handlePromptModeChange() {
  if (autoRunEnabled && getPromptMode() !== 'auto_run') {
    stopAutoRun('Automatic prompting stopped.');
  } else {
    updatePromptControls();
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function logout() {
  stopAutoRun('Auto mode idle.');
  clearToken();
  window.location.href = '/';
}

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPrompt();
});

promptInput.addEventListener('input', () => {
  if (pendingGeneratedPrompt && promptInput.value.trim() !== pendingGeneratedPrompt.prompt_text) {
    setGeneratedPromptMeta(null);
  }
  updatePromptControls();
});

promptModeSelect.addEventListener('change', handlePromptModeChange);

init();
