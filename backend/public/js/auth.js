if (getToken()) {
  window.location.href = '/dashboard.html';
}

function switchTab(tab) {
  document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

if (window.location.hash === '#signup') {
  switchTab('signup');
}

function setLoading(btnId, textId, loading, text) {
  const btn = document.getElementById(btnId);
  const span = document.getElementById(textId);
  if (loading) {
    btn.disabled = true;
    span.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    span.textContent = text;
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('visible');
}

function clearError(id) {
  const el = document.getElementById(id);
  el.classList.remove('visible');
}

async function handleLogin(e) {
  e.preventDefault();
  clearError('login-error');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  setLoading('login-btn', 'login-btn-text', true);
  try {
    const res = await api.auth.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    window.location.href = '/dashboard.html';
  } catch (err) {
    showError('login-error', err.message);
    setLoading('login-btn', 'login-btn-text', false, 'Sign In');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  clearError('signup-error');
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  setLoading('signup-btn', 'signup-btn-text', true);
  try {
    const res = await api.auth.signup({ name, email, password });
    setToken(res.token);
    setUser(res.user);
    window.location.href = '/dashboard.html';
  } catch (err) {
    showError('signup-error', err.message);
    setLoading('signup-btn', 'signup-btn-text', false, 'Create Account');
  }
}
