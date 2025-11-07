// Centralized Authentication Service
// Provides a single source of truth for auth state and UI updates.

const authService = (() => {
  let cachedToken = null;
  let cachedUser = null;
  const logoutCallbacks = [];

  function readStateFromStorage() {
    cachedToken = localStorage.getItem('auth_token');
    const userInfoString = localStorage.getItem('user_info');
    cachedUser = null;
    if (userInfoString) {
      try {
        cachedUser = JSON.parse(userInfoString);
      } catch {
        localStorage.removeItem('user_info');
        cachedUser = null;
      }
    }
  }

  function isAuthenticated() {
    return !!(cachedToken && cachedUser && cachedUser.id);
  }

  function getToken() {
    if (!cachedToken) cachedToken = localStorage.getItem('auth_token');
    return cachedToken;
  }

  function getCurrentUser() {
    if (!cachedUser) {
      const userInfoString = localStorage.getItem('user_info');
      if (userInfoString) {
        try {
          cachedUser = JSON.parse(userInfoString);
        } catch {
          cachedUser = null;
        }
      }
    }
    return cachedUser;
  }

  function clearAuthData() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    cachedToken = null;
    cachedUser = null;
    logoutCallbacks.forEach((cb) => {
      try { cb(); } catch {}
    });
  }

  function onLogout(callback) {
    if (typeof callback === 'function') logoutCallbacks.push(callback);
  }

  function dispatchAuthStateEvent(isAuthed, user) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('authStateReady', { detail: { isAuthenticated: isAuthed, user } }));
    }, 0);
  }

  function updateHeaderUI(isAuthed, user) {
    const authContainer = document.getElementById('authContainer');
    const userMenu = document.getElementById('userMenu');
    const userDisplayName = document.getElementById('userDisplayName');
    const userNameMenu = document.getElementById('userName');
    const userEmailMenu = document.getElementById('userEmail');
    const logoutMenuItem = document.getElementById('logoutMenuItem');

    const loginButtons = document.querySelectorAll('a[href="/login.html"], a[href="login.html"], .login-btn, .auth-btn.login-btn');
    const registerButtons = document.querySelectorAll('a[href="/register.html"], a[href="register.html"], .register-btn, .auth-btn.register-btn');
    const genericAuthButtonsContainers = document.querySelectorAll('.auth-buttons');

    if (isAuthed && user) {
      if (authContainer) { authContainer.style.display = 'none'; authContainer.style.visibility = 'hidden'; }
      if (userMenu) { userMenu.style.display = 'block'; userMenu.style.visibility = 'visible'; }
      if (userDisplayName) userDisplayName.textContent = user.first_name || user.username || 'User';
      if (userNameMenu) userNameMenu.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User Name';
      if (userEmailMenu && user.email) userEmailMenu.textContent = user.email;
      loginButtons.forEach((b) => { b.style.display = 'none'; b.style.visibility = 'hidden'; });
      registerButtons.forEach((b) => { b.style.display = 'none'; b.style.visibility = 'hidden'; });
      genericAuthButtonsContainers.forEach((c) => { if (c.id !== 'authContainer') { c.style.display = 'none'; c.style.visibility = 'hidden'; } });
      if (logoutMenuItem) logoutMenuItem.style.display = 'flex';
    } else {
      if (authContainer) { authContainer.style.display = 'flex'; authContainer.style.visibility = 'visible'; }
      if (userMenu) { userMenu.style.display = 'none'; userMenu.style.visibility = 'hidden'; }
      if (userDisplayName) userDisplayName.textContent = 'User';
      if (userNameMenu) userNameMenu.textContent = 'User Name';
      if (userEmailMenu) userEmailMenu.textContent = '';
      loginButtons.forEach((b) => { b.style.display = 'inline-block'; b.style.visibility = 'visible'; });
      registerButtons.forEach((b) => { b.style.display = 'inline-block'; b.style.visibility = 'visible'; });
      genericAuthButtonsContainers.forEach((c) => { if (c.id !== 'authContainer') { c.style.display = 'flex'; c.style.visibility = 'visible'; } });
      if (logoutMenuItem) logoutMenuItem.style.display = 'none';
    }
  }

  function immediateCssToggle() {
    // Fast, CSS-based hide/show to prevent flicker before scripts finish
    const styleId = 'auth-ui-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    const hasToken = !!localStorage.getItem('auth_token');
    style.textContent = hasToken
      ? `#authContainer, .auth-buttons, a[href="login.html"], a[href="/login.html"], a[href="register.html"], a[href="/register.html"], .login-btn, .register-btn, .auth-btn.login-btn, .auth-btn.register-btn { display: none !important; visibility: hidden !important; } #userMenu, .user-menu { display: block !important; visibility: visible !important; }`
      : `#authContainer, .auth-buttons { display: flex !important; visibility: visible !important; } a[href="login.html"], a[href="/login.html"], a[href="register.html"], a[href="/register.html"], .login-btn, .register-btn, .auth-btn.login-btn, .auth-btn.register-btn { display: inline-block !important; visibility: visible !important; } #userMenu, .user-menu { display: none !important; visibility: hidden !important; }`;
  }

  async function validateTokenAndLoadUser() {
    if (!cachedToken) return;
    try {
      const res = await fetch('/api/auth/validate-token', { headers: { Authorization: `Bearer ${cachedToken}` } });
      if (!res.ok) throw new Error('Token validation failed');
      const data = await res.json();
      if (data && data.valid && data.user) {
        cachedUser = data.user;
        localStorage.setItem('user_info', JSON.stringify(cachedUser));
      } else {
        clearAuthData();
      }
    } catch {
      clearAuthData();
    }
  }

  async function initAuth() {
    readStateFromStorage();
    immediateCssToggle();
    await validateTokenAndLoadUser();
    updateHeaderUI(isAuthenticated(), cachedUser);
    dispatchAuthStateEvent(isAuthenticated(), cachedUser);

    // Keep dropdown handlers consistent
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
      const clone = logoutMenuItem.cloneNode(true);
      logoutMenuItem.parentNode.replaceChild(clone, logoutMenuItem);
      clone.addEventListener('click', () => logout());
    }

    // User menu toggle (replicates legacy behavior from auth.js)
    const userMenuBtnOriginal = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuBtnOriginal && userMenuDropdown) {
      const userMenuBtn = userMenuBtnOriginal.cloneNode(true);
      userMenuBtnOriginal.parentNode.replaceChild(userMenuBtn, userMenuBtnOriginal);
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenuDropdown.classList.toggle('active');
      });
    }

    // Settings gear menu toggle if present
    const settingsBtnOriginal = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsBtnOriginal && settingsMenu) {
      const settingsBtn = settingsBtnOriginal.cloneNode(true);
      settingsBtnOriginal.parentNode.replaceChild(settingsBtn, settingsBtnOriginal);
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('active');
      });
    }

    // Global click to close any open dropdowns (add once)
    if (!window._authServiceGlobalClickListenerAdded) {
      document.addEventListener('click', (e) => {
        const dd = document.getElementById('userMenuDropdown');
        const btn = document.getElementById('userMenuBtn');
        if (dd && btn && dd.classList.contains('active') && !dd.contains(e.target) && !btn.contains(e.target)) {
          dd.classList.remove('active');
        }
        const sm = document.getElementById('settingsMenu');
        const sb = document.getElementById('settingsBtn');
        if (sm && sb && sm.classList.contains('active') && !sm.contains(e.target) && !sb.contains(e.target)) {
          sm.classList.remove('active');
        }
      });
      window._authServiceGlobalClickListenerAdded = true;
    }

    // Storage changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'auth_token' || e.key === 'user_info') {
        readStateFromStorage();
        updateHeaderUI(isAuthenticated(), cachedUser);
        dispatchAuthStateEvent(isAuthenticated(), cachedUser);
      }
    });

    // Optionally hide registration links if registration disabled and user logged out
    if (!getToken()) {
      const hideRegistrationUI = () => {
        const forceHide = (el) => {
          if (!el) return;
          // Strong hide to defeat CSS !important rules
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.setAttribute('hidden', 'true');
          el.setAttribute('aria-hidden', 'true');
        };

        const selectors = [
          '.register-btn', '.auth-btn.register-btn',
          'a[href="register.html"]', 'a[href="./register.html"]', 'a[href="/register.html"]',
          'a[data-i18n="auth.create_account"]'
        ];
        selectors.forEach((sel) => document.querySelectorAll(sel).forEach(forceHide));

        const authLinks = document.querySelector('.auth-links');
        if (authLinks) {
          authLinks.querySelectorAll('a').forEach((a) => {
            const text = (a.textContent || '').trim().toLowerCase();
            if (text === 'create account' || a.getAttribute('href')?.includes('register.html') || a.dataset?.i18n === 'auth.create_account') {
              forceHide(a);
            }
          });
        }
      };

      try {
        const res = await fetch('/api/auth/registration-status');
        if (res.ok) {
          const data = await res.json();
          if (!data.enabled) {
            hideRegistrationUI();
            // Keep it hidden even if i18n or other scripts mutate DOM later
            if (!window._authServiceRegObserver) {
              const observer = new MutationObserver(() => hideRegistrationUI());
              observer.observe(document.body, { childList: true, subtree: true });
              window._authServiceRegObserver = observer;
            }
          }
        }
      } catch {}
    }
  }

  async function login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || 'Login failed');
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('user_info', JSON.stringify(data.user));
    readStateFromStorage();
    updateHeaderUI(true, data.user);
    dispatchAuthStateEvent(true, data.user);
    return data;
  }

  async function logout() {
    const tokenForApi = getToken();
    clearAuthData();
    updateHeaderUI(false, null);
    dispatchAuthStateEvent(false, null);
    try {
      if (tokenForApi) {
        await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${tokenForApi}` } });
      }
    } catch {}
    if (window.location.pathname !== '/login.html') {
      window.location.href = 'login.html';
    }
  }

  return {
    initAuth,
    login,
    logout,
    getToken,
    getCurrentUser,
    isAuthenticated,
    clearAuthData,
    onLogout,
  };
})();

// Backwards compatibility for existing scripts
window.auth = {
  isAuthenticated: () => authService.isAuthenticated(),
  getCurrentUser: () => authService.getCurrentUser(),
  getToken: () => authService.getToken(),
  login: (u, p) => authService.login(u, p),
  logout: () => authService.logout(),
  onLogout: (cb) => authService.onLogout(cb),
};

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  authService.initAuth();
});

export default authService;


