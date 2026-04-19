if (!requireAuth()) throw new Error('Not authenticated');

const AUTO_RUN_DELAY_MS = 5000;

let models = [];
let activeSession = null;
let promptHistory = [];
let pendingGeneratedPrompt = null;
let runnerState = 'idle';
let shouldStopAutoRun = false;
let autoRunTimer = null;
let autoRunCountdownTimer = null;

const modelSelect = document.getElementById('model-select');
const sessionDot = document.getElementById('session-dot');
const sessionStatus = document.getElementById('session-status');
const startBtn = document.getElementById('start-btn');
const endBtn = document.getElementById('end-btn');
const promptModeSelect = document.getElementById('prompt-mode');
const generateBtn = document.getElementById('generate-btn');
const startAutoBtn = document.getElementById('start-auto-btn');
const stopAutoBtn = document.getElementById('stop-auto-btn');
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

function isAutoRunMode() {
  return getPromptMode() === 'auto_run';
}

function isBusy() {
  return runnerState === 'generating' || runnerState === 'submitting';
}

function isAutoRunActive() {
  return runnerState !== 'idle';
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

function setRunnerState(nextState) {
  runnerState = nextState;
  updatePromptControls();
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

function resetAutoRun(statusText = 'Auto mode idle.') {
  shouldStopAutoRun = false;
  clearAutoTimers();
  setRunnerState('idle');
  setAutoStatus(statusText);
}

function stopAutoRun(statusText = 'Automatic prompting stopped.') {
  shouldStopAutoRun = true;

  if (runnerState === 'waiting') {
    clearAutoTimers();
    setRunnerState('idle');
    setAutoStatus(statusText);
    return;
  }

  if (runnerState === 'generating' || runnerState === 'submitting') {
    setRunnerState('stopping');
    setAutoStatus('Stopping after the current request completes...');
    return;
  }

  resetAutoRun(statusText);
}

function stopAutoRunFromButton() {
  stopAutoRun('Automatic prompting stopped.');
}

function scheduleNextAutoRun(result) {
  if (!isAutoRunMode() || shouldStopAutoRun || !activeSession) {
    resetAutoRun('Automatic prompting stopped.');
    return;
  }

  clearAutoTimers();
  setRunnerState('waiting');

  const expected = result.ground_truth.classification;
  const actual = result.training_response.classification;
  let remainingSeconds = AUTO_RUN_DELAY_MS / 1000;

  setAutoStatus(`Observed result: expected ${expected}, model predicted ${actual}. Next prompt in ${remainingSeconds}s.`);

  autoRunCountdownTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(autoRunCountdownTimer);
      autoRunCountdownTimer = null;
      return;
    }
    setAutoStatus(`Observed result: expected ${expected}, model predicted ${actual}. Next prompt in ${remainingSeconds}s.`);
  }, 1000);

  autoRunTimer = setTimeout(() => {
    autoRunTimer = null;
    if (shouldStopAutoRun || !activeSession || !isAutoRunMode()) {
      resetAutoRun('Automatic prompting stopped.');
      return;
    }
    setRunnerState('idle');
    runAutoCycle();
  }, AUTO_RUN_DELAY_MS);
}

function updatePromptControls() {
  const hasSession = Boolean(activeSession);
  const autoMode = isAutoRunMode();
  const autoActive = isAutoRunActive();
  const busy = isBusy();
  const hasPromptText = promptInput.value.trim().length > 0;

  startBtn.disabled = busy || runnerState === 'waiting' || runnerState === 'stopping';
  endBtn.disabled = !hasSession || busy;
  promptModeSelect.disabled = !hasSession || autoActive;
  promptInput.disabled = !hasSession || autoActive || busy;
  analyzeBtn.disabled = !hasSession || !hasPromptText || autoActive || busy;
  generateBtn.disabled = !hasSession || autoMode || autoActive || busy;
  startAutoBtn.disabled = !hasSession || !autoMode || autoActive || busy;
  stopAutoBtn.disabled = !hasSession || !autoActive;

  if (!hasSession && runnerState === 'idle') {
    setAutoStatus('Auto mode idle.');
    return;
  }

  if (runnerState === 'idle') {
    if (autoMode) {
      setAutoStatus('Continuous auto-run ready. Press Start Auto to begin adding a new prompt every 5 seconds.');
    } else if (getPromptMode() === 'review') {
      setAutoStatus('Review mode active. Generate one prompt, inspect it, then analyze.');
    } else {
      setAutoStatus('Manual mode active.');
    }
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
    resetAutoRun('Auto mode idle.');
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
  if (!activeSession || isBusy() || runnerState === 'waiting') return;

  setRunnerState('generating');
  setAutoStatus(autoSubmit ? 'Generating the next automatic prompt...' : 'Generating prompt from recent model weaknesses...');

  try {
    const generated = await api.prompts.generate({ session_id: activeSession.id });
    promptInput.value = generated.prompt_text;
    setGeneratedPromptMeta({
      ...generated,
      source: 'auto_generated'
    });

    if (autoSubmit) {
      await submitPrompt({ sourceOverride: 'auto_generated', fromAutoRun: true });
      return;
    }

    setRunnerState('idle');
    setAutoStatus('Generated prompt ready for review.');
    promptInput.focus();
  } catch (err) {
    resetAutoRun('Automatic prompting stopped after a generation error.');
    alert('Error: ' + err.message);
  }
}

async function submitPrompt({ sourceOverride, fromAutoRun = false } = {}) {
  const text = promptInput.value.trim();
  if (!text || !activeSession) return;
  if (!fromAutoRun && (isBusy() || runnerState === 'waiting')) return;

  clearAutoTimers();
  setRunnerState('submitting');
  analyzeBtn.style.display = 'none';
  analyzeLoading.style.display = 'flex';

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

    if (fromAutoRun) {
      if (shouldStopAutoRun || !isAutoRunMode()) {
        resetAutoRun('Automatic prompting stopped.');
      } else {
        scheduleNextAutoRun(result);
      }
    } else {
      setRunnerState('idle');
      setAutoStatus('Prompt analyzed. Review the expected vs actual classifications above.');
    }
  } catch (err) {
    resetAutoRun('Automatic prompting stopped after a submission error.');
    alert('Error: ' + err.message);
  } finally {
    analyzeBtn.style.display = '';
    analyzeLoading.style.display = 'none';
    if (!fromAutoRun && runnerState === 'submitting') {
      setRunnerState('idle');
    }
    updatePromptControls();
    promptInput.focus();
  }
}

async function runAutoCycle() {
  if (!activeSession || shouldStopAutoRun || !isAutoRunMode()) {
    resetAutoRun('Automatic prompting stopped.');
    return;
  }

  await generatePrompt({ autoSubmit: true });
}

function startAutoRun() {
  if (!activeSession || !isAutoRunMode() || isAutoRunActive() || isBusy()) return;
  shouldStopAutoRun = false;
  runAutoCycle();
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
  if (!activeSession || isAutoRunMode()) return;
  generatePrompt();
}

function handlePromptModeChange() {
  if (isAutoRunActive()) {
    stopAutoRun('Automatic prompting stopped.');
  }
  updatePromptControls();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function logout() {
  resetAutoRun('Auto mode idle.');
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
