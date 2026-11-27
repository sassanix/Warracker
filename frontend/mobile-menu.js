(function() {
    function tMobile(key, fallback) {
        try {
            if (window.i18n && typeof window.i18n.t === 'function') {
                const translated = window.i18n.t(key);
                if (translated && translated !== key) return translated;
            }
            if (window.i18next && typeof window.i18next.t === 'function' && window.i18next.isInitialized) {
                const translated = window.i18next.t(key);
                if (translated && translated !== key) return translated;
            }
        } catch (_) {}
        return fallback;
    }

    function buildMobileMenuContent(panel, header) {
        if (!panel || !header) return;
        const activeLang = (window.i18next && window.i18next.language) || '';
        if (panel.getAttribute('data-built') === 'true' && panel.getAttribute('data-built-lang') === activeLang) return;
        panel.innerHTML = '';

        const createSection = (titleText) => {
            const title = document.createElement('div');
            title.className = 'section-title';
            title.textContent = titleText;
            panel.appendChild(title);
        };

        const appendLinks = (links) => {
            if (!links || links.length === 0) return;
            const list = document.createElement('div');
            list.className = 'menu-list';
            links.forEach(a => {
                try {
                    const cloned = a.cloneNode(true);
                    if (cloned.id) cloned.id = '';
                    list.appendChild(cloned);
                } catch (_) {}
            });
            panel.appendChild(list);
        };

        const isAuthenticated = !!(function(){ try { return localStorage.getItem('auth_token'); } catch(_) { return null; } })();
        let displayName = '';
        const headerDisplayNameEl = header.querySelector('#userDisplayName');
        if (headerDisplayNameEl && headerDisplayNameEl.textContent) {
            displayName = headerDisplayNameEl.textContent.trim();
        }
        if (!displayName) {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || 'null');
                if (userInfo) displayName = userInfo.first_name || userInfo.username || tMobile('nav.account', 'Account');
            } catch(_) {}
        }
        if (!displayName) displayName = tMobile('nav.account', 'Account');

        const navLinksContainer = header.querySelector('.nav-links');
        const navAnchors = navLinksContainer ? Array.from(navLinksContainer.querySelectorAll('a')) : [];
        if (navAnchors.length) {
            createSection(tMobile('nav.navigation', 'Navigation'));
            appendLinks(navAnchors);
        }

        const authContainer = header.querySelector('#authContainer');
        const authAnchors = (!isAuthenticated && authContainer) ? Array.from(authContainer.querySelectorAll('a')) : [];
        if (!isAuthenticated && authAnchors.length) {
            createSection(tMobile('nav.account', 'Account'));
            appendLinks(authAnchors);
        }

        const userDropdown = header.querySelector('#userMenuDropdown');
        const userMenuAnchors = (isAuthenticated && userDropdown) ? Array.from(userDropdown.querySelectorAll('a')) : [];
        if (isAuthenticated && userMenuAnchors.length) {
            createSection(displayName || tMobile('nav.account', 'Account'));
            appendLinks(userMenuAnchors);

            const logoutSource = header.querySelector('#logoutMenuItem');
            if (logoutSource) {
                const logoutLink = document.createElement('a');
                logoutLink.href = '#';
                logoutLink.id = 'mobileLogoutLink';
                const logoutIcon = document.createElement('i');
                logoutIcon.className = 'fas fa-sign-out-alt';
                const logoutSpan = document.createElement('span');
                logoutSpan.setAttribute('data-i18n', 'auth.logout');
                logoutSpan.textContent = tMobile('auth.logout', 'Logout');
                logoutLink.appendChild(logoutIcon);
                logoutLink.appendChild(document.createTextNode(' '));
                logoutLink.appendChild(logoutSpan);
                logoutLink.addEventListener('click', async function(e) {
                    e.preventDefault();
                    try {
                        if (window.auth && typeof window.auth.logout === 'function') {
                            await window.auth.logout();
                        } else {
                            localStorage.removeItem('auth_token');
                            localStorage.removeItem('user_info');
                            window.location.href = 'login.html';
                        }
                    } catch (_) {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('user_info');
                        window.location.href = 'login.html';
                    }
                });
                const list = document.createElement('div');
                list.className = 'menu-list';
                list.appendChild(logoutLink);
                panel.appendChild(list);
            }
        }

        panel.setAttribute('data-built', 'true');
        panel.setAttribute('data-built-lang', activeLang);
        return panel.querySelectorAll('a').length > 0;
    }

    function hasNavigableItems(header) {
        if (!header) return false;
        const isAuthenticated = !!(function(){ try { return localStorage.getItem('auth_token'); } catch(_) { return null; } })();
        const navLinks = header.querySelectorAll('.nav-links a').length;
        const authLinks = !isAuthenticated ? header.querySelectorAll('#authContainer a').length : 0;
        const userLinks = isAuthenticated ? header.querySelectorAll('#userMenuDropdown a').length : 0;
        return (navLinks + authLinks + userLinks) > 0;
    }

    function initializeMobileMenu() {
        const header = document.querySelector('header');
        if (!header) return;
        const toggleBtn = header.querySelector('.mobile-menu-toggle');
        const panel = document.getElementById('mobileMenuPanel');
        const overlay = document.getElementById('mobileMenuOverlay');
        if (!toggleBtn || !panel || !overlay) return;

        if (!hasNavigableItems(header)) {
            toggleBtn.style.display = 'none';
            return;
        }

        if (toggleBtn.getAttribute('data-mm-bound') === '1') return;
        toggleBtn.setAttribute('data-mm-bound', '1');

        const openMenu = () => {
            buildMobileMenuContent(panel, header);
            if (!panel.querySelector('a')) {
                toggleBtn.style.display = 'none';
                return;
            }
            panel.classList.add('is-open');
            overlay.classList.add('is-open');
            document.body.classList.add('mobile-menu-active');
        };

        const closeMenu = () => {
            panel.classList.remove('is-open');
            overlay.classList.remove('is-open');
            document.body.classList.remove('mobile-menu-active');
        };

        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const isOpen = panel.classList.contains('is-open');
            if (isOpen) closeMenu(); else openMenu();
        });

        overlay.addEventListener('click', function() {
            closeMenu();
        });

        panel.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panel.classList.contains('is-open')) {
                closeMenu();
            }
        });
    }

    window.initializeMobileMenu = initializeMobileMenu;
    document.addEventListener('DOMContentLoaded', initializeMobileMenu);
})();


