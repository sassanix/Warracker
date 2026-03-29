// Centralized Authentication Service implemented as an AuthManager class.
class AuthManager {
  constructor() {
    this.cachedToken = null;
    this.cachedUser = null;
    this.logoutCallbacks = [];
    this.globalClickListenerAttached = false;
    this.storageListenerAttached = false;
    this.registrationObserver = null;
    this.initialized = false;
  }

  readStateFromStorage() {
    this.cachedToken = localStorage.getItem('auth_token');
    const userInfoString = localStorage.getItem('user_info');
    this.cachedUser = null;
    if (userInfoString) {
      try {
        this.cachedUser = JSON.parse(userInfoString);
      } catch {
        localStorage.removeItem('user_info');
        this.cachedUser = null;
      }
    }
  }

  isAuthenticated() {
    return !!(this.cachedToken && this.cachedUser && this.cachedUser.id);
  }

  getToken() {
    if (!this.cachedToken) this.cachedToken = localStorage.getItem('auth_token');
    return this.cachedToken;
  }

  getCurrentUser() {
    if (!this.cachedUser) {
      const userInfoString = localStorage.getItem('user_info');
      if (userInfoString) {
        try {
          this.cachedUser = JSON.parse(userInfoString);
        } catch {
          this.cachedUser = null;
        }
      }
    }
    return this.cachedUser;
  }

  clearAuthData() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    this.cachedToken = null;
    this.cachedUser = null;
    this.logoutCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.error('[authService] logout callback failed', error);
      }
    });
  }

  onLogout(callback) {
    if (typeof callback === 'function') this.logoutCallbacks.push(callback);
  }

  dispatchAuthStateEvent(isAuthed, user) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('authStateReady', { detail: { isAuthenticated: isAuthed, user } }));
    }, 0);
  }

  updateHeaderUI(isAuthed, user) {
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

  immediateCssToggle() {
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

  async validateTokenAndLoadUser() {
    if (!this.cachedToken) return;
    try {
      const res = await fetch('/api/auth/validate-token', { headers: { Authorization: `Bearer ${this.cachedToken}` } });
      if (!res.ok) throw new Error('Token validation failed');
      const data = await res.json();
      if (data && data.valid && data.user) {
        this.cachedUser = data.user;
        localStorage.setItem('user_info', JSON.stringify(this.cachedUser));
      } else {
        this.clearAuthData();
      }
    } catch {
      this.clearAuthData();
    }
  }

  attachDropdownHandlers() {
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
      const clone = logoutMenuItem.cloneNode(true);
      logoutMenuItem.parentNode.replaceChild(clone, logoutMenuItem);
      clone.addEventListener('click', () => this.logout());
    }

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

    if (!this.globalClickListenerAttached) {
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
      this.globalClickListenerAttached = true;
    }
  }

  attachStorageListener() {
    if (this.storageListenerAttached) return;
    window.addEventListener('storage', (e) => {
      if (e.key === 'auth_token' || e.key === 'user_info') {
        this.readStateFromStorage();
        this.updateHeaderUI(this.isAuthenticated(), this.cachedUser);
        this.dispatchAuthStateEvent(this.isAuthenticated(), this.cachedUser);
      }
    });
    this.storageListenerAttached = true;
  }

  async ensureRegistrationVisibility() {
    if (this.getToken()) return;
    const hideRegistrationUI = () => {
      const forceHide = (el) => {
        if (!el) return;
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
          if (!this.registrationObserver) {
            this.registrationObserver = new MutationObserver(() => hideRegistrationUI());
            this.registrationObserver.observe(document.body, { childList: true, subtree: true });
          }
        }
      }
    } catch {
      // Ignore errors: failing to hide registration links is non-fatal
    }
  }

  async initAuth() {
    if (this.initialized) {
      this.readStateFromStorage();
      this.updateHeaderUI(this.isAuthenticated(), this.cachedUser);
      this.dispatchAuthStateEvent(this.isAuthenticated(), this.cachedUser);
      return;
    }
    this.initialized = true;
    this.readStateFromStorage();
    this.immediateCssToggle();
    await this.validateTokenAndLoadUser();
    this.updateHeaderUI(this.isAuthenticated(), this.cachedUser);
    this.dispatchAuthStateEvent(this.isAuthenticated(), this.cachedUser);
    this.attachDropdownHandlers();
    this.attachStorageListener();
    await this.ensureRegistrationVisibility();
  }

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || 'Login failed');
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('user_info', JSON.stringify(data.user));
    this.readStateFromStorage();
    this.updateHeaderUI(true, data.user);
    this.dispatchAuthStateEvent(true, data.user);
    return data;
  }

  async logout() {
    const tokenForApi = this.getToken();
    this.clearAuthData();
    this.updateHeaderUI(false, null);
    this.dispatchAuthStateEvent(false, null);
    try {
      if (tokenForApi) {
        await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${tokenForApi}` } });
      }
    } catch {
      // ignore network errors during logout
    }
    if (window.location.pathname !== '/login.html') {
      window.location.href = 'login.html';
    }
  }
}

const authService = new AuthManager();

// Backwards compatibility for existing scripts
window.auth = {
  isAuthenticated: () => authService.isAuthenticated(),
  getCurrentUser: () => authService.getCurrentUser(),
  getToken: () => authService.getToken(),
  login: (u, p) => authService.login(u, p),
  logout: () => authService.logout(),
  onLogout: (cb) => authService.onLogout(cb),
  checkAuthState: (isInitialLoad) => authService.initAuth(),
};

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  authService.initAuth();
});

export default authService;


