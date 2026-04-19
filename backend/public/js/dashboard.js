if (!requireAuth()) throw new Error('Not authenticated');

let models = [];
let activeSession = null;
let promptHistory = [];

const modelSelect = document.getElementById('model-select');
const sessionDot = document.getElementById('session-dot');
const sessionStatus = document.getElementById('session-status');
const startBtn = document.getElementById('start-btn');
const endBtn = document.getElementById('end-btn');
const promptInput = document.getElementById('prompt-input');
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeLoading = document.getElementById('analyze-loading');
const analyzeBtnText = document.getElementById('analyze-btn-text');

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
    const active = sessions.find(s => s.is_active);
    if (active) {
      activeSession = active;
      const model = models.find(m => m.id === active.training_llm_id);
      if (model) modelSelect.value = model.id;
      setSessionActive(true, active.id);
    }
  } catch (err) {
    console.error(err);
  }
}

function populateModelSelect() {
  modelSelect.innerHTML = '<option value="">Select model...</option>';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });
}

function populateNavModels() {
  const container = document.getElementById('nav-models-list');
  container.innerHTML = '';
  models.forEach(m => {
    const a = document.createElement('a');
    a.href = `/model.html?id=${m.id}`;
    a.className = 'nav-item nav-sub-item';
    a.innerHTML = `<span>${m.name}</span>`;
    container.appendChild(a);
  });
}

function setSessionActive(active, sessionId) {
  if (active) {
    sessionDot.classList.add('active');
    sessionStatus.textContent = `Session #${sessionId} active`;
    sessionStatus.classList.add('active-text');
    startBtn.style.display = 'none';
    endBtn.style.display = '';
    promptInput.disabled = false;
    analyzeBtn.disabled = false;
    document.getElementById('prompt-history').style.display = '';
  } else {
    sessionDot.classList.remove('active');
    sessionStatus.textContent = 'No active session';
    sessionStatus.classList.remove('active-text');
    startBtn.style.display = '';
    endBtn.style.display = 'none';
    promptInput.disabled = true;
    analyzeBtn.disabled = true;
    activeSession = null;
  }
}

function onModelChange() {
  if (!activeSession) return;
}

async function startSession() {
  const modelId = parseInt(modelSelect.value);
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
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('results-section').style.display = 'none';
    setSessionActive(true, session.id);
  } catch (err) {
    if (err.message.includes('active session')) {
      const sessions = await api.sessions.list();
      const existing = sessions.find(s => s.is_active && s.training_llm_id === modelId);
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
  }
}

async function endSession() {
  if (!activeSession) return;
  if (!confirm('End this training session?')) return;
  endBtn.disabled = true;
  try {
    await api.sessions.end(activeSession.id);
    setSessionActive(false);
    document.getElementById('results-section').style.display = 'none';
  } catch (err) {
    alert(err.message);
  } finally {
    endBtn.disabled = false;
  }
}

async function submitPrompt() {
  const text = promptInput.value.trim();
  if (!text) return;
  if (!activeSession) return;

  analyzeBtn.style.display = 'none';
  analyzeLoading.style.display = 'flex';
  promptInput.disabled = true;

  try {
    const result = await api.prompts.submit({ session_id: activeSession.id, prompt_text: text });
    renderResult(result);
    promptHistory.unshift({ num: result.performance.prompt_number, text, result });
    renderHistory();
    promptInput.value = '';
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    analyzeBtn.style.display = '';
    analyzeLoading.style.display = 'none';
    promptInput.disabled = false;
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
  document.getElementById('training-reasoning').textContent = r.training_response.reasoning || '—';

  gtBadge.textContent = r.ground_truth.classification;
  gtBadge.className = `classification-badge ${r.ground_truth.classification}`;
  document.getElementById('gt-reasoning').textContent = r.ground_truth.reasoning || '—';

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

  setAgent('orchestrator', agents.orchestrator.active, 'Active — routing decision made');
  setAgent('learn', agents.learn_agent.active, agents.learn_agent.active ? 'Active — insight generated' : 'Skipped');
  setAgent('knowledge', agents.training_knowledge_agent.active, agents.training_knowledge_agent.active ? 'Active — knowledge updated' : 'Skipped');
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
    div.innerHTML = `
      <span class="history-num">#${item.num}</span>
      <span class="history-text">${escapeHtml(item.text)}</span>
      <div class="history-badges">
        <span class="classification-badge ${item.result.ground_truth.classification}" style="font-size:10px;padding:2px 6px">${item.result.ground_truth.classification}</span>
        <span class="correct-badge ${isCorrect ? 'correct' : 'incorrect'}" style="font-size:10px">${isCorrect ? '✓' : '✗'}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function logout() {
  clearToken();
  window.location.href = '/auth.html';
}

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPrompt();
});

init();
