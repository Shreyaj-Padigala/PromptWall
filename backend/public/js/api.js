const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('pw_token');
}

function setToken(token) {
  localStorage.setItem('pw_token', token);
}

function clearToken() {
  localStorage.removeItem('pw_token');
  localStorage.removeItem('pw_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('pw_user') || 'null');
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem('pw_user', JSON.stringify(user));
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/';
    return false;
  }
  return true;
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

const api = {
  auth: {
    signup: (body) => apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
    login:  (body) => apiFetch('/auth/login',  { method: 'POST', body: JSON.stringify(body) }),
    me:     ()     => apiFetch('/auth/me')
  },
  models: {
    list:        ()   => apiFetch('/models'),
    get:         (id) => apiFetch(`/models/${id}`),
    performance: (id) => apiFetch(`/models/${id}/performance`)
  },
  sessions: {
    create: (body) => apiFetch('/sessions', { method: 'POST', body: JSON.stringify(body) }),
    list:   ()     => apiFetch('/sessions'),
    get:    (id)   => apiFetch(`/sessions/${id}`),
    end:    (id)   => apiFetch(`/sessions/${id}/end`, { method: 'PATCH' })
  },
  prompts: {
    submit: (body) => apiFetch('/prompts', { method: 'POST', body: JSON.stringify(body) }),
    get:    (id)   => apiFetch(`/prompts/${id}`)
  }
};
