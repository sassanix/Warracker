import authService from './authService.js';

async function baseRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = authService.getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const opts = { ...options, headers };
  const response = await fetch(path, opts);
  if (!response.ok) {
    const message = await safeErrorMessage(response);
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response;
}

async function safeErrorMessage(response) {
  try {
    const data = await response.clone().json();
    return data?.message || data?.error || null;
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return null;
    }
  }
}

export async function getWarranties(query = '') {
  const res = await baseRequest(`/api/warranties${query ? `?${query}` : ''}`);
  return res.json();
}

export async function createWarranty(formData) {
  const res = await baseRequest('/api/warranties', { method: 'POST', body: formData });
  return res.json();
}

export async function updateWarranty(id, formData) {
  const res = await baseRequest(`/api/warranties/${id}`, { method: 'PUT', body: formData });
  return res.json();
}

export async function deleteWarranty(id) {
  await baseRequest(`/api/warranties/${id}`, { method: 'DELETE' });
  return true;
}

export async function getStatistics() {
  const res = await baseRequest('/api/statistics');
  return res.json();
}

export async function listWarranties({ scope = 'personal', archived = false } = {}) {
  const base = scope === 'global' ? '/api/warranties/global' : '/api/warranties';
  const path = archived ? `${base}/archived` : base;
  const res = await baseRequest(path);
  return res.json();
}

export async function getGlobalViewStatus() {
  const res = await baseRequest('/api/settings/global-view-status');
  return res.json();
}

export async function getUserPreferences() {
  const res = await baseRequest('/api/auth/preferences');
  return res.json();
}

export async function saveUserPreferences(preferences) {
  const res = await baseRequest('/api/auth/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  return res.json();
}

// --- Settings & Admin endpoints ---
export async function getUser() {
  const res = await baseRequest('/api/auth/user');
  return res.json();
}

export async function getSiteSettings() {
  const res = await baseRequest('/api/admin/settings');
  return res.json();
}

export async function saveSiteSettings(settings) {
  const res = await baseRequest('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getUsers() {
  const res = await baseRequest('/api/admin/users');
  return res.json();
}

export async function updateUser(userId, data) {
  const res = await baseRequest(`/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteUser(userId) {
  await baseRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
  return true;
}

export async function getAuditTrail() {
  const res = await baseRequest('/api/admin/audit-trail');
  return res.json();
}

export async function triggerNotifications() {
  const res = await baseRequest('/api/admin/send-notifications', { method: 'POST' });
  return res.json();
}

// Tags
export async function getTags(force = false) {
  const res = await baseRequest(force ? '/api/tags?force=1' : '/api/tags');
  return res.json();
}

export async function createTagRequest(payload) {
  const res = await baseRequest('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateTagRequest(id, payload) {
  const res = await baseRequest(`/api/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteTagRequest(id) {
  await baseRequest(`/api/tags/${id}`, { method: 'DELETE' });
  return true;
}

// Generic request helper for arbitrary endpoints
export async function request(path, options = {}) {
  return baseRequest(path, options);
}

export async function savePreferences(prefs) {
  const res = await baseRequest('/api/auth/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  return res.json();
}

// Backwards-compatible helper available to non-module scripts
if (typeof window !== 'undefined') {
  // Non-intrusive fetch shim: adds Authorization for /api calls when missing
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.startsWith('/api')) {
        const headers = new Headers((init && init.headers) || {});
        if (!headers.has('Authorization')) {
          const token = authService.getToken();
          if (token) headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }
    } catch {}
    return originalFetch(input, init);
  };

  window.api = {
    getWarranties,
    updateWarranty,
    deleteWarranty,
    getStatistics,
    request,
    savePreferences,
    // settings & admin
    getUser,
    getSiteSettings,
    saveSiteSettings,
    getUsers,
    updateUser,
    deleteUser,
    getAuditTrail,
    triggerNotifications,
  };
}

export default {
  getWarranties,
  createWarranty,
  updateWarranty,
  deleteWarranty,
  getStatistics,
  listWarranties,
  getGlobalViewStatus,
  getUserPreferences,
  saveUserPreferences,
  request,
  savePreferences,
  // settings & admin
  getUser,
  getSiteSettings,
  saveSiteSettings,
  getUsers,
  updateUser,
  deleteUser,
  getAuditTrail,
  triggerNotifications,
  getTags,
  createTagRequest,
  updateTagRequest,
  deleteTagRequest,
};


