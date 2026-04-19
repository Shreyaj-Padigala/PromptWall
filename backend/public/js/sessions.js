if (!requireAuth()) throw new Error('Not authenticated');

let selectedSessionId = null;

async function init() {
  const user = getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();
  }

  try {
    const [sessions, models] = await Promise.all([api.sessions.list(), api.models.list()]);
    populateNavModels(models);
    renderSessions(sessions);
  } catch (err) {
    console.error(err);
    document.getElementById('sessions-loading').style.display = 'none';
  }
}

function populateNavModels(models) {
  const container = document.getElementById('nav-models-list');
  container.innerHTML = '';
  models.forEach(m => {
    const a = document.createElement('a');
    a.href = `/model.html?id=${m.id}`;
    a.className = 'nav-item nav-sub-item';
    a.textContent = m.name;
    container.appendChild(a);
  });
}

function renderSessions(sessions) {
  document.getElementById('sessions-loading').style.display = 'none';

  if (!sessions || sessions.length === 0) {
    document.getElementById('sessions-empty').style.display = '';
    return;
  }

  document.getElementById('sessions-list').style.display = '';
  const tbody = document.getElementById('sessions-tbody');
  tbody.innerHTML = '';

  sessions.forEach(s => {
    const acc = parseFloat(s.final_accuracy || 0);
    const accClass = acc >= 70 ? 'high' : acc >= 40 ? 'mid' : 'low';
    const started = new Date(s.started_at).toLocaleString();
    const duration = s.ended_at
      ? formatDuration(new Date(s.started_at), new Date(s.ended_at))
      : (s.is_active ? '<span class="text-accent">Ongoing</span>' : '—');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-muted">#${s.id}</td>
      <td class="session-model">${escapeHtml(s.model_name)}</td>
      <td>${s.prompt_count}</td>
      <td><span class="accuracy-pill ${accClass}">${acc.toFixed(1)}%</span></td>
      <td>${s.is_active ? '<span class="session-dot active" style="display:inline-block;vertical-align:middle;margin-right:5px"></span><span class="text-accent" style="font-size:11px">Active</span>' : '<span class="text-muted" style="font-size:11px">Ended</span>'}</td>
      <td class="text-muted">${started}</td>
      <td class="text-muted">${duration}</td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => loadSessionDetail(s.id, s));
    tbody.appendChild(tr);
  });
}

function formatDuration(start, end) {
  const ms = end - start;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

async function loadSessionDetail(sessionId, summary) {
  selectedSessionId = sessionId;
  const panel = document.getElementById('session-detail-panel');
  panel.style.display = '';
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('detail-loading').style.display = 'flex';
  document.getElementById('detail-title').textContent = `Session #${sessionId} — ${summary.model_name}`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const session = await api.sessions.get(sessionId);
    renderDetail(session);
  } catch (err) {
    console.error(err);
  }
}

function renderDetail(session) {
  document.getElementById('detail-loading').style.display = 'none';
  document.getElementById('detail-content').style.display = '';
  const container = document.getElementById('detail-prompts');
  container.innerHTML = '';

  if (!session.prompts || session.prompts.length === 0) {
    container.innerHTML = '<div class="text-muted" style="font-size:12px;padding:20px 0">No prompts in this session.</div>';
    return;
  }

  session.prompts.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'detail-prompt-row';
    const isCorrect = p.is_correct;
    const errorMap = { false_positive: 'FP', false_negative: 'FN' };

    div.innerHTML = `
      <span class="detail-prompt-num">${i + 1}</span>
      <div>
        <div class="detail-prompt-text">${escapeHtml(p.text)}</div>
        <div class="detail-prompt-meta" style="margin-top:4px;display:flex;gap:10px;align-items:center">
          <span class="classification-badge ${p.gt_classification}" style="font-size:10px;padding:1px 6px">${p.gt_classification}</span>
          <span class="correct-badge ${isCorrect ? 'correct' : 'incorrect'}" style="font-size:10px">${isCorrect ? 'Correct' : `Incorrect${p.error_type ? ' · ' + errorMap[p.error_type] : ''}`}</span>
        </div>
        ${p.key_takeaway ? `<div class="detail-prompt-insight">${escapeHtml(p.key_takeaway)}</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-2);white-space:nowrap">${new Date(p.created_at).toLocaleTimeString()}</div>
    `;
    container.appendChild(div);
  });
}

function closeDetail() {
  document.getElementById('session-detail-panel').style.display = 'none';
  selectedSessionId = null;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function logout() {
  clearToken();
  window.location.href = '/';
}

init();
