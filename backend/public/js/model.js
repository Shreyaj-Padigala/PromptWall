if (!requireAuth()) throw new Error('Not authenticated');

const params = new URLSearchParams(window.location.search);
const modelId = params.get('id');

if (!modelId) window.location.href = '/dashboard.html';

let chartInstance = null;

async function init() {
  const user = getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();
  }

  try {
    const [model, performance, allModels] = await Promise.all([
      api.models.get(modelId),
      api.models.performance(modelId),
      api.models.list()
    ]);

    populateNavModels(allModels, parseInt(modelId));
    renderModelInfo(model);
    renderStats(model);
    renderChart(performance);
    renderKnowledge(model);
  } catch (err) {
    console.error(err);
    document.getElementById('model-name').textContent = 'Model not found';
  }
}

function populateNavModels(models, currentId) {
  const container = document.getElementById('nav-models-list');
  container.innerHTML = '';
  models.forEach(m => {
    const a = document.createElement('a');
    a.href = `/model.html?id=${m.id}`;
    a.className = `nav-item nav-sub-item ${m.id === currentId ? 'active' : ''}`;
    a.textContent = m.name;
    container.appendChild(a);
  });
}

function renderModelInfo(model) {
  document.title = `PromptWall — ${model.name}`;
  document.getElementById('model-name').textContent = model.name;
  document.getElementById('model-desc').textContent = model.description || `Base model: ${model.base_model}`;
}

function renderStats(model) {
  const acc = model.current_accuracy || 0;
  document.getElementById('stat-accuracy').textContent = `${acc.toFixed(1)}%`;
  document.getElementById('stat-prompts').textContent = model.total_prompts || 0;
  document.getElementById('stat-correct').textContent = model.total_correct || 0;
  document.getElementById('stat-status').innerHTML = `<span class="status-chip ${model.status}">${model.status}</span>`;
}

function renderChart(performance) {
  const container = document.getElementById('chart-container');
  const empty = document.getElementById('chart-empty');

  if (!performance || performance.length === 0) {
    container.style.display = 'none';
    empty.style.display = '';
    return;
  }

  container.style.display = '';
  empty.style.display = 'none';

  const labels = performance.map(p => `#${p.prompt_number}`);
  const data = performance.map(p => parseFloat(p.accuracy.toFixed(1)));

  if (chartInstance) chartInstance.destroy();

  const ctx = document.getElementById('performance-chart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Detection Accuracy (%)',
        data,
        borderColor: '#e05a1c',
        backgroundColor: 'rgba(224, 90, 28, 0.06)',
        borderWidth: 2,
        pointBackgroundColor: '#e05a1c',
        pointBorderColor: '#e05a1c',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e1e',
          titleColor: '#ebebeb',
          bodyColor: '#a0a0a0',
          borderColor: '#252525',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'JetBrains Mono, monospace', size: 11 },
          bodyFont: { family: 'JetBrains Mono, monospace', size: 12 },
          callbacks: {
            title: (items) => `Prompt ${items[0].label}`,
            label: (item) => `Accuracy: ${item.raw}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#1c1c1c' },
          ticks: { color: '#5a5a5a', font: { family: 'JetBrains Mono, monospace', size: 11 }, maxTicksLimit: 12 },
          border: { color: '#252525' }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: '#1c1c1c' },
          ticks: {
            color: '#5a5a5a',
            font: { family: 'JetBrains Mono, monospace', size: 11 },
            callback: (v) => `${v}%`
          },
          border: { color: '#252525' }
        }
      }
    }
  });
}

function renderKnowledge(model) {
  const el = document.getElementById('knowledge-content');
  if (model.knowledge_summary && model.knowledge_summary.trim()) {
    el.textContent = model.knowledge_summary;
    el.classList.remove('knowledge-empty');
  } else {
    el.innerHTML = '<span class="knowledge-empty">No training knowledge yet. The model hasn\'t made any mistakes to learn from.</span>';
  }
}

function logout() {
  clearToken();
  window.location.href = '/';
}

init();
