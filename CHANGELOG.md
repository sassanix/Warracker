# Changelog
## 1.0.3 - 2025-11-07

### Added  
- **Vite build tool (multi-page app) for the frontend**  
  - Initialized npm in `frontend/` with `dev`, `build`, and `preview` scripts.  
  - Introduced `vite.config.js` with `root: 'src'`, `outDir: '../dist'`, `publicDir: 'public'`, a development `/api` proxy, and explicit multi-page HTML inputs.  
  - Restructured frontend: moved sources to `frontend/src/` and static/non-module assets to `frontend/public/`.  
  - _Files: `frontend/package.json`, `frontend/vite.config.js`, `frontend/src/**/*`, `frontend/public/**/*`_  

- **Centralized Authentication Service**  
  - New module `authService.js` exposes `initAuth`, `login`, `logout`, `getToken`, `getCurrentUser`, `isAuthenticated`.  
  - Backwards compatibility: attaches a `window.auth` facade so existing code continues to work.  
  - Handles header UI state, user menu/settings dropdown toggling, and dispatches a unified `authStateReady` event.  
  - Robustly hides “Create Account” UI when registration is disabled (with a MutationObserver to keep it hidden after other scripts mutate the DOM).  
  - _Files: `frontend/src/js/services/authService.js`, `frontend/src/*.html` (module includes)_  

- **Dedicated API Service**  
  - New `apiService.js` provides a `baseRequest` wrapper that injects the `Authorization` header and normalizes error handling.  
  - Exposes named helpers (e.g., `getWarranties`, `updateWarranty`, `deleteWarranty`, `getStatistics`, `savePreferences`) and a `window.api` shim for non-module scripts.  
  - Safe global `fetch` shim adds the Authorization header for `/api/...` calls when missing.  
  - _Files: `frontend/src/js/services/apiService.js`, `frontend/src/*.html` (module includes)_  

  - **Central State Management Store**
  - Introduced a `store.js` module to act as a single source of truth for application data (warranties, filters, loading states), eliminating scattered global variables.
  - UI updates are now driven by custom events, creating a predictable data flow.
  - _Files: `frontend/src/js/store.js`_

- **Component-Based UI Modules**
  - Created a suite of new, reusable UI component modules to replace HTML string concatenation. Each is responsible for building a specific part of the UI via safe DOM manipulation.
  - Modules include: `warrantyCard.js`, `tag.js`, `modals.js`, `editModal.js`, `claims.js`, `notes.js`, `paperless.js`, and `ui.js`.
  - _Files: `frontend/src/js/components/*`_

- **HTML `<template>` for Warranty Cards**
  - Added a `<template id="warranty-card-template">` to `index.html` to define the warranty card structure, separating markup from rendering logic for improved performance and maintainability.
  - _Files: `frontend/src/index.html`_

### Enhanced  
- **Dockerfile: multi-stage frontend build + runtime serving**  
  - Added `frontend-build` stage using `node:20-alpine` to run `npm ci && npm run build`.  
  - Final stage copies `frontend/dist/` to `/var/www/html` and includes `frontend/public/` assets in the build.  
  - Unpinned Node digest to resolve `not found` errors on some hosts.  
  - _Files: `Dockerfile`_  

- **HTML and asset loading**  
  - Switched all page `<script>` and `<link>` paths to root-relative (e.g., `/script.js`).  
  - Ensured `script.js` is loaded with `defer` across pages to avoid early DOM access issues.  
  - Moved non-module assets (e.g., `i18n.js`, `i18next*.js`, `script.js`, `theme-loader.js`, etc.) to `frontend/public/` so they are served verbatim in production.  
  - _Files: `frontend/src/*.html`, `frontend/public/**/*`_  

- **Build stability**  
  - Moved `settings-styles.css` to `public/` to bypass a PostCSS parse error in production builds (no functional/visual changes).  
  - _Files: `frontend/public/settings-styles.css`_  

- **Major UI Refactor for Maintainability & Security**
  - Replaced nearly all `innerHTML` assignments with a robust, component-based rendering approach. This makes the UI easier to debug, maintain, and more secure against XSS vulnerabilities.
  - **Warranty List:** The main warranty display for grid, list, and table views is now rendered using the `warrantyCard.js` component.
  - **Edit Modal:** The complex dynamic sections (serial numbers, current document displays for invoices/manuals/photos, and tag selection) are now built with the `editModal.js` component.
  - **Claims Modal:** The entire claims view, including the header, loading/error states, and claims list, is now rendered by the `claims.js` component.
  - **Other Modals:** Refactored the rendering logic for the Tag Management, Notes, and Paperless-ngx document browser modals to use their respective new components.
  - _Files: `frontend/src/script.js`, `frontend/src/js/components/*`_

### Fixed  
- 404s for non-module assets in production by serving them from Vite `public/`.  
- User menu not opening: restored click/close listeners within `authService.js`.  
- Login page “Create Account” visible while registration disabled: force-hidden with strong CSS and observer.  
- Status page edit actions blocked by early `document.body.appendChild(...)`: added `defer` to `script.js` includes. 
- **Security:** Mitigated potential cross-site scripting (XSS) vulnerabilities by removing reliance on building the UI with `innerHTML` from dynamic data.
- **Performance:** Improved rendering performance by using efficient DOM creation and appending (`<template>` clones, `document.createElement`) instead of causing the browser to re-parse large HTML strings on every update.
- **Code Quality:** Drastically reduced code complexity and repetition in `script.js` by delegating UI creation to specialized component modules. 

### Removed  
- Legacy, scattered auth scripts now replaced by `authService.js`:  
  - `frontend/src/auth.js`, `frontend/src/auth-new.js`, `frontend/src/include-auth-new.js`, `frontend/src/fix-auth-buttons.js`, `frontend/src/fix-auth-buttons-loader.js`, `frontend/src/registration-status.js`.  
  - **Global State Variables**
  - Eliminated global variables like `let warranties = []` and `let currentFilters = {}` from `script.js`, centralizing all state management within `store.js`.
- **Hardcoded HTML Strings**
  - Removed large, multi-line HTML string templates from JavaScript files, which were fragile and difficult to maintain.


## 1.0.2 - 2025-10-30

### Added  
- **CSV Import: Exact Expiration Date support (`ExpirationDate`)**  
  - Uses an exact `ExpirationDate` when duration fields (`WarrantyDurationYears`, `WarrantyDurationMonths`, `WarrantyDurationDays`) are all 0/blank and `IsLifetime` is `FALSE`.  
  - Documentation updated to include the new field and its conditional usage.  
  - _Files: `backend/warranties_routes.py`, `README.md`_

### Enhanced  
- **CSV Import: Partial commits with per-row errors**  
  - Successful rows are committed even if some rows fail; the response includes detailed errors for failed rows.  
  - Returns `200` for partial success; returns `400` only if all rows fail.  
  - _Files: `backend/warranties_routes.py`_  

- **CSV Import: Automatic duplicate name suffixing**  
  - If a `ProductName` already exists for the same `PurchaseDate` (in the database or earlier in the same file), the importer now auto-renames it to `Name (1)`, `Name (2)`, etc.  
  - Prevents hard failures for separate products that share the same name/date but have different serials/metadata.  
  - _Files: `backend/warranties_routes.py`_

 - **Permissions: Enhanced fixing process for upload folder and database**  
   - Updated entrypoint log to "Fixing permissions (database and upload folder)" and invoke `fix_permissions.py` for both scopes  
   - Split into `fix_upload_folder_permissions()` and `fix_database_permissions()`; recursively ensures upload ownership to `warracker:warracker` (uid:999, gid:999) with improved logging and connection retry handling  
   - _Files: `Docker/entrypoint.sh`, `backend/fix_permissions.py`_  
   - Credit: Enhancement contributed by [@Erwan-loot](https://github.com/Erwan-loot)  
   - Ref: [commit b63f7d2](https://github.com/sassanix/Warracker/commit/b63f7d20860663c3c00a702ea830bbf058e612c3) (PR #180)  

## 1.0.1 - 2025-10-26

### Fixed  
- Container startup loop caused by insufficient PostgreSQL privileges in the startup permissions script.  
  - Wrapped the `ALTER ROLE ... CREATEROLE` in a safe DO block with exception handling so missing privilege is logged as a NOTICE and startup continues.  
  - No feature changes; service now starts normally without elevated DB privileges.  
  - _Files: `backend/fix_permissions.sql`_

## 1.0.0 - 2025-10-24 

### Added  
- **Renovate Bot Integration**: Automated dependency management system  
  - Complete configuration in `renovate.json` with intelligent grouping (Debian packages, Python packages, GitHub Actions)  
  - GitHub Actions workflow for automatic execution every Monday at midnight  
  - Advanced features: merge confidence badges, version pinning, OpenSSF Scorecard security checks, and separation of multiple major releases  
  - _Files: `.github/workflows/renovate.yml`, `renovate.json`_  
  - Credit: Renovate integration contributed by [@Erwan-loot](https://github.com/Erwan-loot)  

- **Model Number field**: New optional field for warranties to track product model numbers  
  - Backend: Added `model_number` column and wired through all GET/POST/PUT routes  
  - Frontend: New and Edit modals include Model Number input; displayed on warranty cards (all views including Global)  
  - _Files: `backend/migrations/047_add_model_number_to_warranties.sql`, `backend/warranties_routes.py`, `frontend/index.html`, `frontend/status.html`, `frontend/script.js`, `locales/en/translation.json`_  

- **Administrator Audit Trail (admin-only)**  
  - Backend: New `audit_log` table and centralized `create_audit_log` helper. Logs site setting changes (with secrets masked), user updates, and deletions. Added `GET /api/admin/audit-trail` endpoint.  
  - Frontend: Added standalone Audit Trail section in Settings (separate from Apprise) with safe HTML rendering of timestamp, user, action, and details.  
  - _Files: `backend/migrations/048_create_audit_log_table.sql`, `backend/audit_logger.py`, `backend/admin_routes.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_  

- **Docker configuration files**: Dedicated setup for containerized environments  
  - `Docker/entrypoint.sh` – main entry script  
  - `Docker/nginx-wrapper.sh` – NGINX wrapper  
  - `Docker/supervisord.conf` – Supervisor configuration  
  - _Files: `Docker/entrypoint.sh`, `Docker/nginx-wrapper.sh`, `Docker/supervisord.conf`_  

- Polish language support added to all pages (index, about, status, settings) with comprehensive translations for UI elements, messages, and system text.  
  - _Files: `locales/pl/translation.json`_  
  - Credit: Polish translation contributed by [@GaikMarcin](https://github.com/GaikMarcin)  

- Hebrew language support added across the app (index, about, status, settings) with full translations and RTL support.  
  - Frontend: Added `he` to supported languages and RTL list, updated Settings language dropdown  
  - Backend: Added `he` to supported languages and language map; migration updates DB constraint  
  - _Files: `locales/he/translation.json`, `locales/en/translation.json`, `frontend/js/i18n.js`, `frontend/settings-new.html`, `backend/localization.py`, `backend/migrations/050_update_language_constraint_he.py`_  
  - Credit: Hebrew translation contributed by [@ngfblog](https://github.com/ngfblog)  

 - Warranty claim modal i18n: Completed translations for remaining locales  
  - Coverage: `ar`, `cs`, `de`, `es`, `fa`, `fr`, `hi`, `it`, `ja`, `ko`, `nl`, `pt`, `ru`, `uk`, `zh_CN`, `zh_HK`  
  - _Files: `locales/ar/translation.json`, `locales/cs/translation.json`, `locales/de/translation.json`, `locales/es/translation.json`, `locales/fa/translation.json`, `locales/fr/translation.json`, `locales/hi/translation.json`, `locales/it/translation.json`, `locales/ja/translation.json`, `locales/ko/translation.json`, `locales/nl/translation.json`, `locales/pt/translation.json`, `locales/ru/translation.json`, `locales/uk/translation.json`, `locales/zh_CN/translation.json`, `locales/zh_HK/translation.json`_  

- About page: Reddit community link and localization  
  - Added `https://www.reddit.com/r/Warracker/` under Community & Support with proper branding  
  - Localized new label `about.reddit_community` across all supported locales  
  - _Files: `frontend/about.html`, `locales/*/translation.json`_  

### Enhanced  
- **Dockerfile optimization**: Complete refactor using a multi-stage build  
  - Smaller image size, clear separation between build and runtime stages  
  - Pinned dependencies and applied Docker security best practices  
  - _Files: `Dockerfile` (major refactor)_  
  - Credit: Dockerfile optimization contributed by [@Erwan-loot](https://github.com/Erwan-loot)  

- **Git configuration**: Enforced LF line endings for shell scripts  
  - _Files: `.gitattributes`_  

- **OIDC handler improvements**: Refactored authentication handler for maintainability  
  - _Files: `backend/oidc_handler.py`_  

- **Database handler enhancements**: Improved connection and query management  
  - _Files: `backend/db_handler.py`_  

- **Add Warranty modal tabs – responsive alignment**  
  - Adjusted label size and spacing below ≤740px to prevent wrapping  
  - Maintains icon+label pairing; five-step indicator consistent across breakpoints  
  - _Files: `frontend/style.css`_  

- **Frontend cache busting and version updates**  
  - Updated service worker cache and version checker for new logic  
  - Ensured clients receive updated assets  
  - _Files: `frontend/sw.js`, `frontend/version-checker.js`, `frontend/*.html`_  

- **PWA cache refresh and immediate activation**  
  - Bumped service worker cache to `warracker-cache-v20251024001` and added `skipWaiting()` + `clients.claim()` for instant rollout.  
  - Updated all `footer-fix.js` references to `?v=20251024001` and added to SW pre-cache to guarantee delivery of the scrollbar fix.  
  - Cleaned service worker pre-cache by removing a duplicate `script.js` entry.  
  - _Files: `frontend/sw.js`, `frontend/*.html`_  


- **Search enhancements**: Include Model Number in search across Home and Status  
  - Main view: Added `model_number` matching in quick search and filter pipeline; updated placeholder to mention model  
  - Status page: Enabled search by `model_number` in the recent expirations table  
  - Backend: Included `model_number` in statistics responses to support status page search  
  - _Files: `frontend/script.js`, `frontend/status.js`, `backend/statistics_routes.py`, `frontend/index.html`, `locales/en/translation.json`_  

- **Status page – Archived support**: Archived warranties are now first-class on the dashboard  
  - Added "Archived" to the Status filter on the Recently Expired or Expiring Soon table  
  - Rows show an "Archived" status with neutral grey styling that matches warranty cards  
  - Backend statistics endpoints now include `is_archived` to power filtering and labels  
  - Updated table filtering/sorting: archived items are excluded from Active/Expiring/Expired, appear under All and Archived, and sort with proper priority  
  - _Files: `backend/statistics_routes.py`, `frontend/status.html`, `frontend/status.js`, `frontend/style.css`_  


### Fixed  
- **Global warranties view**: Global view on Index page now properly displays warranties from all users  
  - Backend: Added `GET /api/warranties/global/archived` and unified global queries using correlated subqueries to avoid row collapse  
  - Frontend: When scope = Global and Status = "All", merges archived warranties via the new endpoint  
  - Archived Global view now uses the correct global archived endpoint  
  - Cache bust applied to ensure updated logic  
  - _Files: `backend/warranties_routes.py`, `frontend/script.js`, `frontend/sw.js`, `frontend/index.html`, `frontend/status.html`_  

- **Global view: Model Number display**  
  - Backend: Included `model_number` in global and archived global warranty queries so the UI can render it correctly  
  - _Files: `backend/warranties_routes.py`_  

- **Localization completeness: Model Number labels across all languages**  
  - Added `warranties.model_number` and `warranties.model_number_optional` to all locales so warranty cards and forms display localized labels  
  - Fixed Polish locale: added missing `warranties.model_number`; removed duplicate keys in warranties/messages  
  - _Files: `locales/ar/translation.json`, `locales/cs/translation.json`, `locales/de/translation.json`, `locales/es/translation.json`, `locales/fa/translation.json`, `locales/fr/translation.json`, `locales/nl/translation.json`, `locales/ru/translation.json`, `locales/zh_CN/translation.json`, `locales/zh_HK/translation.json`, `locales/it/translation.json`, `locales/tr/translation.json`, `locales/uk/translation.json`, `locales/hi/translation.json`, `locales/ja/translation.json`, `locales/ko/translation.json`, `locales/pl/translation.json`, `locales/pt/translation.json`_  

- **Add Warranty modal tabs: tiny-screen overlap**  
  - Prevented tab labels from overlapping on very small devices (≤430px) by switching to icon-only tabs and enabling horizontal scrolling within the tab bar.  
  - _Files: `frontend/style.css`_  

- **Document URL links not visible unless notes existed**  
  - Fixed warranty cards hiding the document links row when only external URLs were provided (Invoice/Manual/Files). The visibility check now includes `invoice_url`, `manual_url`, and `other_document_url`, so URL-only links render without requiring a note or uploaded file.  
  - _Files: `frontend/script.js`_  

- **Chrome: extra page horizontal scrollbar**  
  - Removed `100vw` width and negative margin hacks from the footer script that caused horizontal overflow in Chrome; now uses `width: 100%` with zero side margins.  
  - _Files: `frontend/footer-fix.js`_  

### Dependencies  
**Major updates:**  
- **Python**: 3.13 → 3.14 (Docker base image)  
- **gevent**: 24.2.1 → 25.9.1  
- **flask-cors**: 4.0.1 → 6.0.1  
- **Font Awesome**: 6.4.0 → 7.x  
- **postgresql-client**: 15.10 → 17  

**Minor/patch updates:**  
- **Flask**: 3.0.3 → 3.1.2  
- **Werkzeug**: 3.0.3 → 3.1.3  
- **psycopg2**: 2.9.9 → 2.9.11  
- **PyJWT**: 2.8.0 → 2.10.1  
- **email-validator**: 2.1.1 → 2.3.0  
- **APScheduler**: 3.10.4 → 3.11.0  
- **python-dateutil**: 2.9.0 → 2.9.0.post0  
- **Authlib**: 1.3.1 → 1.6.5  
- **requests**: 2.32.3 → 2.32.5  
- **setuptools**: <81 → 80.9.0  
- **apprise**: 1.9.3 → 1.9.5  
- **Babel**: 2.16.0 → 2.17.0  
- **renovatebot/github-action**: v43.0.16 → v43.0.17  
_Files: `backend/requirements.txt`, `Dockerfile`_  


### Migration Notes  
- Database migration **049** updates the `users.preferred_language` constraint to include 'pl'  
- Database migration **047** adds the `model_number` column (auto-runs on startup)  
- Rebuild Docker image for **Python 3.14** and updated dependencies  
- Verify **CORS** compatibility with `flask-cors` v6  
- Confirm **Font Awesome v7** icons render correctly  
- Ensure PostgreSQL server compatibility with **client v17**  


## 0.10.1.14 - 2025-10-06

### Enhanced
- Filters persist like view settings and survive navigation/view changes:
  - Persist filters (Status, Tag, Vendor, Type, Search, Sort) to localStorage and, when authenticated, sync to API preferences (`saved_filters`) for cross-device consistency.
  - Skip API writes on initial page load (mirrors view preference behavior) to avoid noisy saves.
  - Switching views now re-applies the full filter set via `applyFilters()` instead of resetting results.
  - _Files: `frontend/script.js`, `frontend/index.html`, `backend/auth_routes.py`, `backend/migrations/046_add_saved_filters_column.sql`_
- All Status includes archived warranties (personal scope): When Status is set to "All" (and not in Global View), archived warranties are fetched and merged into the list to give a complete view. Archived items are flagged and rendered with the correct labeling and actions.
  - _Files: `frontend/script.js`_

- Index page filter persistence and reset refinements:
  - Restore saved Search input on load (value, clear button visibility, and active state styling).
  - Persist Search alongside Status, Tag, Vendor, and Type when applying filters.
  - Clear resets filters to defaults, removes saved `warrantyFilters` and `warrantySortBy`, clears Search UI, and closes the Filter popover.
  - _Files: `frontend/index.html`_
 - PyJWT compatibility: Updated authentication handling to support PyJWT 2.10.
   - _Files: `backend/auth_utils.py`, `backend/oidc_handler.py`_
 - Deprecated datetime usage: Replaced deprecated `utcnow()` calls with timezone-aware alternatives.
   - _Files: `backend/*`_
 - OIDC-managed user settings: Hide/disable settings managed by OIDC to avoid conflicting edits.
   - _Files: `backend/oidc_handler.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_
 - OIDC attribute synchronization: Sync key OIDC attributes on login for consistency.
   - _Files: `backend/oidc_handler.py`, `backend/auth_utils.py`_
 - UX: Made the entire user menu item clickable (not just the text).
   - _Files: `frontend/index.html`, `frontend/style.css`_

- Mobile UX: Hide user menu button on mobile and use hamburger as the sole trigger; when authenticated, the mobile menu uses the username as the section title for clarity. No desktop changes.
  - _Files: `frontend/mobile-header.css`, `frontend/script.js`_

 - Login page tablet logo (769–820px): Show the Warracker logo/title above the login form on iPad Air and similar tablet widths to match mobile branding.
   - _Files: `frontend/style.css`_

### Added
- OIDC admin via groups: Allow determining admin status from configured OIDC group membership.
  - _Files: `backend/oidc_handler.py`, `backend/auth_utils.py`, `backend/config.py`_
- OIDC admin group setting: Added configurable OIDC admin group in site settings.
  - _Files: `backend/config.py`, `backend/app.py`_
- Configurable upload folder: Make the upload folder path configurable.
  - _Files: `backend/config.py`, `backend/file_routes.py`_
- Secrets from files: Support reading sensitive settings from `*_FILE` paths.
  - _Files: `backend/config.py`_
- Secure default secret: Attempt to generate a secure secret at runtime if none is provided.
  - _Files: `backend/config.py`, `backend/app.py`_

- Mobile hamburger menu (≤768px): Added modern slide‑out panel with overlay for Index, Status, Settings, and About. Dynamically clones nav links and user/auth actions into the panel, locks body scroll while open, and closes on overlay or link click. Desktop layout unaffected.
  - _Files: `frontend/mobile-header.css`, `frontend/index.html`, `frontend/status.html`, `frontend/settings-new.html`, `frontend/about.html`, `frontend/script.js`, `frontend/mobile-menu.js`_

### Fixed
- Archived styling parity under All: Archived items displayed under "All" now use the same neutral styling as the dedicated Archived view (per-card `.warranty-card.archived` styles).
  - _Files: `frontend/style.css`, `frontend/script.js`_
- Exclude archived from non-archived filters: Archived warranties no longer appear under specific status filters (Active, Expiring, Expired). They show only under "All" and "Archived".
  - _Files: `frontend/script.js`_
- Re-merge archived after filter changes: Switching away from Archived and back to All reliably reloads and re-merges archived items to keep the view consistent.
  - _Files: `frontend/script.js`_
 - OIDC reload: Fixed OIDC client reload by moving `init_oidc_client` to an appropriate lifecycle.
   - _Files: `backend/oidc_handler.py`, `backend/app.py`_
 - OIDC userinfo: Stopped relying on token `userinfo` claim; use the userinfo endpoint as source of truth.
   - _Files: `backend/oidc_handler.py`_

- Settings page mobile menu toggle: Fixed initialization by isolating the hamburger logic into a dedicated script to avoid duplicate identifier errors in the global script, ensuring the menu opens/closes correctly.
  - _Files: `frontend/mobile-menu.js`, `frontend/settings-new.html`, `frontend/script.js`_

- Login page header/menu regression: Restored standalone login page by removing header/hamburger and mobile menu assets.
  - _Files: `frontend/login.html`_

- Login button label corrected: Button now reads just "Login"; page title uses a separate translation key to avoid suffix leaking into the button. Introduced `auth.login_title` and updated the login page to reference it.
  - _Files: `locales/en/translation.json`, `frontend/login.html`_

- Status dashboard tablet layout (769–820px, iPad Air): Summary cards now display in two rows with Active and Expiring Soon on the first row, and Expired and Total on the second row for clearer hierarchy at this width.
  - _Files: `frontend/style.css`_

### Credit
- OIDC and configuration improvements contributed by @tecosaur in PR #138.

## 0.10.1.13 - 2025-09-29

### Added
- Turkish language support added to all pages (index, about, status, settings) with comprehensive translations for UI elements, messages, and system text.
  - _Files: `locales/tr/translation.json`_

### Enhanced
- Modernized Login Page UI with a clean two-column layout (branding showcase + form), refined form controls with icons, improved separator, and provider-branded SSO button styling. Fully responsive and theme-aware (light/dark) with styles scoped to the login page only to prevent regressions elsewhere.
  - Preserved all original element IDs and existing functionality (local login, OIDC/SSO).
  - _Files: `frontend/login.html`, `frontend/style.css`_

- Refactored Warranty Filters and Sort UI on Index Page with modern popover-based interface to declutter the main interface while preserving all functionality.
  - **Filter/Sort Popover System:** Replaced individual filter dropdowns with clean "Filter" and "Sort" buttons that open organized popover panels containing all original filtering and sorting controls.
  - **Data Management Consolidation:** Combined separate Import/Export buttons into a unified "Data" dropdown menu with Import and Export options.
  - **Button Styling Unification:** Applied consistent bordered button styling with proper hover states and alignment across Filter, Sort, Data, and Tags buttons.
  - **Responsive Layout:** Implemented flexible search row layout that wraps gracefully on smaller screens while maintaining button alignment and functionality.
  - **Theme Compatibility:** All new UI components fully support existing light and dark themes using application CSS variables.
  - **Zero-Impact Implementation:** Changes strictly limited to `frontend/index.html` and `frontend/style.css` with all original element IDs preserved for JavaScript compatibility.
  - _Files: `frontend/index.html`, `frontend/style.css`_

- Persisted Filters, Sort, and Indicator Across Sessions:
  - Saves Status, Tag, Vendor, and Warranty Type filters and Sort selection to localStorage (user-specific prefix) on Apply/change and restores them on load.
  - Filter indicator (green dot) now reflects persisted state across navigations and reloads.
  - _Files: `frontend/index.html`, `frontend/script.js`_

- Tag Management and Live Updates:
  - Auto-save color changes in Manage Tags; changes persist immediately without Edit/Save.
  - Live UI refresh after tag create/update/delete; tag lists, selections, filters, and warranty cards update without page reload.
  - CSV import now refreshes the tags list to include any newly created tags.
  - _Files: `frontend/script.js`_

- Modern Tag Management Modal UI:
  - `renderExistingTags`: Builds a table with Color, Name, Actions; rows include display spans and hidden inputs to enable inline editing.
  - `addTagManagementEventListeners`: Delegated handlers for edit, save, cancel, delete, and color changes; attached once per modal open to avoid duplicates.
  - `editTag`: Toggles the row into inline edit mode by showing inputs and swapping action groups.
  - `updateTag`: Performs API update; on success, reloads tags and re-renders the modal and dependent UIs (selected tags, filters, warranty cards), then toasts success. `openTagManagementModal` ensures listeners are present.
  - Styles: Appended “MODERN TAG MANAGEMENT MODAL STYLES” for the table, hover states, color swatch with hidden color input, inline name input, and action groups; uses CSS variables for light/dark compatibility.
  - Scope/Safety: Changes are confined to the tag management modal UI; CRUD flows preserved. On update/delete, the modal, tags in forms, filter dropdowns, and warranty cards re-render appropriately.
  - Test: Open Manage Tags to see the table; Edit toggles inline fields; Save updates via API; Cancel restores values; color swatch opens native picker and updates preview; Delete prompts and removes; Create adds rows; all changes reflect on cards and in filters; verify responsiveness and dark theme.
  - _Files: `frontend/script.js`, `frontend/style.css`_

- Mobile view: Filter/Sort label compaction on small screens
  - Auto-hide Filter and Sort button text up to 425px (icons-only) to preserve space without changing behavior or popover anchoring.
  - _Files: `frontend/mobile-header.css`_
  - 3-row mobile layout: Row 1 is Search (full-width); Row 2 groups Filter | Sort | Data; Row 3 places Tags | View | Scope for better usability on narrow screens.
  - _Files: `frontend/mobile-header.css`_

### Added
- Mobile logo and title: On screens ≤768px, a centered Warracker logo with the “Warracker” label is displayed above the login form for better brand presence.
  - _Files: `frontend/login.html`, `frontend/style.css`_

- Non-Destructive Warranty Archive: Allow users to archive old/expired warranties without deleting data. Archived items are hidden from the default lists and can be viewed via an explicit Archived filter.
  - Default behavior preserved: main endpoints continue to return only non-archived warranties; no UX change unless Archived filter is selected.
  - Reversible: users can unarchive items to return them to the main list.
  - Soft delete only: implemented via `archived_at` timestamp; no DELETEs performed for this feature.
  - API:
    - New `GET /api/warranties/archived` (user scope) to fetch archived warranties.
    - New `PATCH /api/warranties/{id}/archive` with body `{ "archived": true|false }` to toggle archive state.
    - Existing `GET /api/warranties` updated to exclude archived; global and admin listing endpoints also exclude archived by default.
  - Database: migration adds nullable `archived_at` column with partial index (`WHERE archived_at IS NULL`).
  - Notifications: expiring-warranty notifications ignore archived warranties.
  - Frontend:
    - Added “Archived” to Status filter; selecting it loads the archived endpoint.
    - Archive/Unarchive buttons on cards (Edit disabled in archived view). Bottom status row shows “Archived”.
    - Neutral archived styling (top header and card accents use gray; avoids red/green/orange).
  - _Files: `backend/migrations/045_add_archived_at_to_warranties.sql`, `backend/warranties_routes.py`, `backend/notifications.py`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

### Fixed
- Dark mode input visibility: Username/password text and caret now use theme text colors; placeholders use appropriate contrast in both themes.
- SSO button alignment: Preserved baseline `btn-sso` alignment class while applying provider-specific classes (e.g., Google, GitHub) to keep the button centered and branded.
- i18n safety: Mapped showcase description to existing translation keys to avoid missing-translation warnings.
- Mobile usability: Re-enabled scrolling and adjusted spacing to ensure the page fits better on small screens; limited the mobile logo to ≤768px and stacked it above the form.
  - _Files: `frontend/login.html`, `frontend/style.css`_

- Resolved JavaScript error “Identifier 'isArchivedView' has already been declared” that prevented warranty loading after introducing the Archived filter.
  - Removed duplicate `const isArchivedView` declaration and streamlined archived-data loading flow.
  - _Files: `frontend/script.js`_

 - Dark mode navigation consistency (mobile and desktop): unify `.nav-link` hover/active backgrounds across pages so Status behaves like Home when dark mode is enabled.
  - _Files: `frontend/header-fix.css`_

 - Localization and i18n completeness:
   - Added empty-archive messages: `messages.no_warranties_found`, `messages.no_warranties_found_add_first` (English base + propagated to all locales) to prevent raw keys.
   - Added missing Claims section keys to all locales (English placeholders where needed).
   - Fixed Italian placeholder to use `{{days}} {{dayText}}` for `warranties.days_remaining`.
   - Added missing `warranty_period` in Czech.
   - Updated language lists: added `ko` to Portuguese and Japanese.
   - _Files: `locales/en/translation.json`, `locales/fr/translation.json`, `locales/es/translation.json`, `locales/de/translation.json`, `locales/it/translation.json`, `locales/nl/translation.json`, `locales/cs/translation.json`, `locales/pt/translation.json`, `locales/ru/translation.json`, `locales/uk/translation.json`, `locales/zh_CN/translation.json`, `locales/zh_HK/translation.json`, `locales/ja/translation.json`, `locales/ko/translation.json`, `locales/ar/translation.json`, `locales/fa/translation.json`, `locales/hi/translation.json`_



## 0.10.1.12 - 2025-09-18

### Fixed
- **Paperless-ngx Document Upload Duplicate Detection:** Fixed critical bug where incorrect API parameter caused all new document uploads to Paperless-ngx to be falsely identified as duplicates, preventing new documents from being uploaded and instead linking them to existing unrelated documents.
  - **Root Cause:** The duplicate detection logic was using an invalid API parameter `checksum` instead of the correct `checksum__iexact` parameter when querying Paperless-ngx for existing documents, causing the API to return unexpected results that incorrectly matched all uploads as duplicates.
  - **Solution:** Corrected the API parameter from `checksum` to `checksum__iexact` to properly perform exact checksum matching against existing documents in Paperless-ngx.
  - **Impact:** Users can now successfully upload new documents to Paperless-ngx without false duplicate warnings, while legitimate duplicate detection continues to work correctly for actual duplicate files.
  - **Credit:** Fix contributed by @sjafferali in PR #127.
  - _Files: `backend/paperless_handler.py`_

### Enhanced
- **Production Database Driver Optimization:** Replaced `psycopg2-binary` with `psycopg2` for improved production stability and performance.
  - **Production Best Practice:** Switched from the development-oriented `psycopg2-binary` package to the production-recommended `psycopg2` package to avoid potential conflicts with system libraries and improve runtime stability.
  - **Build Dependencies:** The existing Dockerfile already contains all necessary build dependencies (`build-essential`, `libpq-dev`) required to compile `psycopg2` from source.
  - **Impact:** Enhanced production deployment stability while maintaining full PostgreSQL database connectivity and compatibility.
  - _Files: `backend/requirements.txt`_

- **Development Environment Library Access:** Removed `/lib` directory from .gitignore to allow tracking of essential library files in the repository.
  - **Repository Management:** Updated .gitignore configuration to include library files that were previously excluded from version control.
  - **Impact:** Ensures necessary library dependencies are properly tracked and available for development and deployment processes.
  - _Files: `.gitignore`_

### Fixed
- **Missing JavaScript Assets for Non-Docker Installations:** Fixed critical error preventing the status page and internationalization features from functioning correctly in non-Docker installations due to missing i18next library files.
  - **Root Cause:** The `/lib` directory containing essential i18next JavaScript libraries was excluded from version control via .gitignore, causing these files to be missing in non-Docker deployments where they couldn't be served from CDN.
  - **Solution:** Updated service worker cache configuration to include the three required i18next library files (`i18next.min.js`, `i18nextHttpBackend.min.js`, `i18nextBrowserLanguageDetector.min.js`) and incremented cache version to ensure users receive the updated assets.
  - **Impact:** Status page and all internationalization features now work correctly in non-Docker installations, eliminating JavaScript errors and ensuring consistent functionality across all deployment methods.
  - **Cache Update:** Service worker cache version updated from `v20250119001` to `v20250918001` to force cache refresh for existing users.
  - _Files: `frontend/sw.js`_

- **Paperless-ngx API Token Authentication with 2FA Enabled:** Resolved critical authentication failure when using API tokens with Paperless-ngx instances that have Two-Factor Authentication (2FA) enabled. Users can now securely connect Warracker to their 2FA-protected Paperless-ngx accounts without compromising security.
  - **Root Cause:** The Paperless-ngx integration was inadvertently using session-based authentication paths that conflicted with 2FA requirements, causing API token requests to be rejected even when tokens were valid.
  - **Solution:** Implemented pure token-only authentication by clearing cookies before each request, disabling automatic redirects to login pages, and ensuring all API calls use only the `Authorization: Token <token>` header without session interference.
  - **Enhanced Error Handling:** Added detection and clear error messaging for authentication redirects (3xx responses) that would indicate token rejection, helping users troubleshoot configuration issues.
  - **Backward Compatibility:** All existing functionality remains unchanged for users without 2FA enabled, ensuring seamless operation across different Paperless-ngx configurations.
  - **Security Maintained:** Users can keep 2FA enabled on their Paperless-ngx accounts while using API tokens for Warracker integration, maintaining the highest security standards.
  - _Files: `backend/paperless_handler.py`, `backend/file_routes.py`_

## 0.10.1.11 - 2025-09-07

### Enhanced
- **Global View Paperless-ngx Default Behavior:** Enhanced Paperless-ngx document viewing behavior in Global View to automatically open other users' documents within the Warracker app interface instead of external tabs, providing a more seamless and consistent user experience.
  - **Smart Context Detection:** System automatically detects when viewing another user's Paperless-ngx documents in Global View and overrides individual user preferences to default to in-app viewing.
  - **Improved User Experience:** Users can now view invoices, manuals, and other Paperless-ngx documents from other users directly within Warracker without being redirected to external Paperless-ngx interface, maintaining workflow continuity.
  - **Preserved Personal Preferences:** User's personal Paperless-ngx viewing preferences remain unchanged for their own documents, only affecting the viewing behavior for other users' documents in Global View.
  - **Consistent Interface:** Provides uniform document viewing experience across all Global View documents while respecting user privacy and access controls.
  - _Files: `frontend/script.js`_

- **Warranty Claims Visual Status Indicators:** Added intuitive visual indicators to warranty cards that display claim status at-a-glance through color-coded Claims buttons, eliminating the need to open modals to check claim activity.
  - **Purple Claims Button:** Warranties with open claims (Submitted or In Progress status) display a purple Claims button with subtle pulsing animation to draw attention to items requiring action.
  - **Blue Claims Button:** Warranties with finished claims (Resolved, Denied, Approved, or Cancelled status) display a blue Claims button indicating completed claim activity.
  - **Default Claims Button:** Warranties with no claims retain standard gray styling, providing clear visual distinction between different claim states.
  - **Enhanced User Experience:** Users can instantly identify warranty claim status from the main view without opening individual claim modals, improving workflow efficiency and claim management visibility.
  - **Smart Tooltips:** Claims buttons display contextual tooltips ("Claims", "Claims (Open)", "Claims (Finished)") providing additional status information on hover.
  - **Database Integration:** Backend APIs enhanced to calculate and return claim status summary (NO_CLAIMS, OPEN, FINISHED) across all warranty listing endpoints including main view, admin view, and global view.
  - _Files: `backend/warranties_routes.py`, `frontend/script.js`, `frontend/style.css`_

- **Global View Warranty Claims Read-Only Access:** Users can now view warranty claims from other users' warranties in Global View mode with appropriate read-only permissions, enhancing transparency and claim visibility across the organization.
  - **Read-Only Claims Viewing:** Users in Global View can access and view detailed warranty claims information for warranties owned by other users, providing comprehensive claim visibility while maintaining data security.
  - **Permission-Based Access Control:** Claims viewing respects existing Global View permissions - users can only view claims if Global View is enabled and they have appropriate access rights (admin-only restrictions apply when configured).
  - **Intuitive UI Indicators:** Claims modals clearly indicate read-only mode with "View Only" labels, hidden edit/delete buttons, and contextual messaging to prevent confusion about access levels.
  - **Seamless Integration:** Claims buttons remain fully functional in Global View, eliminating the "Failed to load claims" error and providing consistent user experience across all warranty views.
  - **Preserved Security:** Create, edit, and delete operations remain restricted to warranty owners only, ensuring data integrity while expanding read access appropriately.
  - _Files: `backend/warranties_routes.py`, `frontend/script.js`_

### Fixed
- **Global View Document Access Authorization:** Fixed authorization issue preventing users from viewing invoices and manuals of other users' warranties when Global View is enabled. Users can now access shared warranty documents (invoices, manuals, photos, URL links, and Paperless-ngx documents) in Global View while maintaining privacy for sensitive "other documents".
  - **Root Cause:** The secure file access endpoint restricted invoice and manual access to warranty owners only, even when Global View was active and should allow broader document sharing. Additionally, the Global View API endpoints were missing Paperless-ngx document IDs and URL fields in their database queries, preventing these documents from being displayed in the frontend.
  - **Solution:** Extended global view permissions logic to include invoice_path, manual_path, paperless_invoice_id, and paperless_manual_id alongside existing product_photo_path support, while explicitly maintaining privacy restrictions for other_document_path and paperless_other_id. Fixed Global View API endpoints to include all document fields (paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id, invoice_url, manual_url, other_document_url) in database queries. Enhanced frontend document link generation to properly show all shared document types in Global View with appropriate permission checks.
  - **Security:** Maintains strict privacy controls ensuring "other documents" remain accessible only to warranty owners, and users still cannot edit or delete warranties they don't own. All document access remains read-only in Global View.
  - **Impact:** Users can now view and access invoices, manuals, photos, URL links, and Paperless-ngx documents of other users' warranties when Global View is enabled, providing complete transparency and document sharing capabilities while preserving essential privacy boundaries.
  - _Files: `backend/file_routes.py`, `backend/warranties_routes.py`, `frontend/script.js`_

- **Warranty Claims Creation with Empty Optional Fields:** Fixed critical bug where creating warranty claims with empty 'description' or 'resolution' fields resulted in internal server errors. These fields are now properly handled as optional, allowing users to create claims with only required information (claim date) and add details later as needed.
  - **Root Cause:** The application was not correctly converting empty strings to NULL values for optional database fields, causing database insertion errors.
  - **Solution:** Implemented explicit empty string to NULL conversion logic for description and resolution fields during claim creation, ensuring database compatibility and preventing server errors.
  - **Impact:** Users can now successfully create warranty claims with minimal required information and update them with additional details when available, improving workflow flexibility.
  - _Files: `backend/warranties_routes.py`_

- **Global View Claims Modal JavaScript Errors:** Fixed critical JavaScript errors preventing warranty claims modals from opening in Global View mode due to undefined function references, ensuring seamless claims viewing functionality across all view modes.
  - **Root Cause:** The claims modal initialization code was calling non-existent functions `getCurrentUserId()` and `getViewScope()` instead of using the established patterns for accessing user information and view state in the codebase.
  - **Solution:** Replaced undefined function calls with the correct inline patterns used throughout the application - using an immediately invoked function expression (IIFE) to extract user ID from localStorage and directly accessing the global `isGlobalView` variable for view state detection.
  - **Impact:** Users can now successfully open and view warranty claims in Global View mode without JavaScript errors, completing the read-only claims access functionality and providing full transparency for warranty claim information across the organization.
  - _Files: `frontend/script.js`_


## 0.10.1.10 - 2025-08-30

### Enhanced
- **URL/Link Support for Documents and Invoices:** Introduced comprehensive URL/Link support allowing users to add external URLs for their documents (invoices, manuals, and other files) in addition to the existing file upload functionality. This enhancement provides flexible document management options while maintaining full backward compatibility with existing features.
  - **Database Schema:** Added three nullable columns (`invoice_url`, `manual_url`, `other_document_url`) to the warranties table via migration 043, ensuring zero impact on existing records.
  - **Complete Modal Integration:** Enhanced both Add and Edit warranty modals across all pages with intuitive URL input fields featuring link icons and clean visual integration alongside existing file upload sections. Added URL input fields to both the homepage edit modal (`index.html`) and status page edit modal (`status.html`) for complete feature parity.
  - **Dual Display Support:** Updated warranty cards to display both file links and URL links side by side, with URL links opening in new tabs for seamless external document access.
  - **Smart Summary:** Enhanced the Add Warranty summary to intelligently display either uploaded file names or "URL: [link]" when URLs are provided instead of files.
  - **API Enhancement:** Extended backend API endpoints to handle URL fields in warranty creation, updates, and retrieval with proper form validation and data processing.
  - **Responsive Design:** Added CSS styling for URL input fields with proper icon positioning, hover effects, and mobile-friendly responsive behavior.
  - **Cross-Page Compatibility:** Implemented robust null safety checks in JavaScript functions to prevent errors when URL input elements don't exist on certain pages, ensuring seamless operation across different page contexts.
  - **Error Resolution:** Fixed TypeError issues in edit modal functionality by adding comprehensive null checks for URL field access, ensuring stable operation when switching between different modal implementations.
  - **User Experience:** Users can now choose between file uploads, external URLs, or a combination of both, providing maximum flexibility for different document management workflows and storage preferences across all warranty management interfaces.
  - _Files: `backend/migrations/043_add_document_urls_to_warranties.sql`, `backend/warranties_routes.py`, `frontend/index.html`, `frontend/status.html`, `frontend/script.js`, `frontend/style.css`_

- **Database Port Configuration Support:** Added support for custom database port configuration via the `DB_PORT` environment variable to enhance deployment flexibility. The implementation is fully backward-compatible, defaulting to port 5432 if the variable is not set.
  - **Backend Integration:** Updated `backend/db_handler.py` and `backend/fix_permissions.py` to recognize and use the `DB_PORT` environment variable in all database connection calls.
  - **Docker Support:** Added `DB_PORT` environment variable support to both `docker-compose.yml` files with fallback defaults (`${DB_PORT:-5432}`).
  - **Configuration Examples:** Updated `env.example` with commented DB_PORT configuration option for local development guidance.
  - **Deployment Flexibility:** Users can now customize database ports for non-standard PostgreSQL deployments, multi-instance setups, or specific infrastructure requirements.
  - _Files: `backend/db_handler.py`, `backend/fix_permissions.py`, `docker-compose.yml`, `Docker/docker-compose.yml`, `env.example`_

- **Warranty Claims Tracking System:** Introduced comprehensive warranty claims management functionality allowing users to track and manage warranty claims for their products throughout the entire claim lifecycle.
  - **Database Schema:** Added `warranty_claims` table via migration 044 with support for claim dates, status tracking, claim numbers, descriptions, resolutions, and resolution dates with proper foreign key relationships and indexing.
  - **Backend API:** Implemented full REST API for claims management including endpoints for creating, reading, updating, and deleting warranty claims with proper authentication and authorization checks.
  - **Frontend Integration:** Added intuitive claims modal interface accessible from warranty cards with comprehensive claim management features including status tracking, date management, and detailed claim information.
  - **Status Management:** Implemented claim status workflow with predefined statuses (Submitted, In Progress, Approved, Denied, Resolved, Cancelled) and proper status badge styling for visual clarity.
  - **Date Handling:** Enhanced date formatting and display logic to properly handle claim dates, resolution dates, and warranty expiration dates with robust null value handling and user-friendly formatting.
  - **User Interface:** Positioned Claims button as the first action button in warranty card headers (Claims, Edit, Delete order) with hover tooltip for easy identification and access.
  - **Modal Behavior:** Enhanced claims modal stability by preventing accidental closure when clicking outside the modal area, requiring explicit close button interaction for better user experience.
  - **Data Integrity:** Implemented proper validation, error handling, and database constraints to ensure data consistency and prevent orphaned records.
  - _Files: `backend/migrations/044_create_warranty_claims_table.sql`, `backend/warranties_routes.py`, `frontend/script.js`, `frontend/index.html`_

## 0.10.1.9 - 2025-08-24

### Fixed
- **Critical Apprise Notification Fixes - RESOLVED ✅:** Successfully resolved five critical issues that were preventing scheduled Apprise notifications from being sent:
  - **Configuration Reload Issue:** Added `apprise_handler.reload_configuration()` call in scheduled notification process to ensure the handler uses the latest settings from the database instead of stale startup configuration. This fixes the issue where enabling Apprise via the UI wouldn't trigger scheduled notifications.
  - **Data Fetching Logic Issue:** Removed restrictive `email_notifications` filter from the `get_expiring_warranties` SQL query that was preventing Apprise-only users from receiving notifications. The query now correctly fetches expiring warranties for all active users regardless of their notification channel preference.
  - **Notification Dispatch Logic Issue:** Completely refactored the `send_expiration_notifications` function to properly separate email and Apprise notification logic. The previous implementation failed to pass warranty data to the Apprise handler even when users were correctly identified as eligible. The new implementation uses dedicated helper functions (`is_notification_due`, `process_email_notifications`, `process_apprise_notifications`) that ensure warranty data flows correctly to both notification channels.
  - **Handler Scope Issue:** Fixed the issue where the scheduled notification process was checking a local, uninitialized `apprise_handler` variable instead of the properly configured handler from the Flask application context. Modified `process_apprise_notifications()` to retrieve the handler using `current_app.config.get('APPRISE_HANDLER')`, ensuring the scheduler uses the same fully initialized instance as the rest of the application.
  - **Application Context Issue:** Fixed the final critical issue where the background scheduler was executing jobs outside of the Flask application context, causing "Working outside of application context" errors. Modified `init_scheduler()` to accept the Flask app instance and wrap the scheduled job with `app.app_context()`, ensuring the background task has access to all application configurations and services. Updated all calls to `init_scheduler()` in `backend/__init__.py` and `backend/app.py` to pass the app object.
  - **✅ VERIFICATION COMPLETE:** All fixes have been successfully implemented and tested. Scheduled Apprise notifications now work correctly for users configured with "Apprise only" or "Both" notification channels. The notification system is fully operational, production-ready, and follows Flask best practices for background task integration. Email notifications remain unaffected and continue to work as expected.
  - _Files: `backend/notifications.py`, `backend/__init__.py`, `backend/app.py`_

- **Email Configuration Enhancement:** Added support for `SMTP_FROM_ADDRESS` environment variable to allow customization of the email From address independently of the SMTP username. This provides better flexibility for email configuration, especially when using email services where the authentication username differs from the desired sender address. ([#115](https://github.com/clmcavaney/warracker/pull/115))
  - _Files: `backend/notifications.py`_

- **Critical Fix for Duplicate Scheduled Notifications:** Fixed critical issue where multiple identical notifications were being sent in 'optimized' and 'performance' modes due to multiple worker processes each running their own notification scheduler. The `should_run_scheduler()` function contained flawed logic with unsafe defaults that allowed multiple workers to incorrectly identify as the primary worker, leading to redundant schedulers and duplicate notifications.
  - **Root Cause:** The function had multiple problematic fallback conditions including defaulting `GUNICORN_WORKER_ID` to '0' when not set, causing all workers to think they were the primary worker.
  - **Solution:** Simplified and strengthened the logic to only allow worker ID '0' to run the scheduler, with no unsafe fallbacks. The function now strictly checks for `GUNICORN_WORKER_ID == '0'` and defaults to not running the scheduler if the worker ID cannot be determined.
  - **Impact:** Users will now receive exactly one notification per scheduled event regardless of the memory mode (ultra-light, optimized, or performance). System efficiency is improved by eliminating redundant background processes.
  - _Files: `backend/notifications.py`_

- **Critical Fix for Scheduler Database Connection Handling:** Fixed critical issue where scheduled notifications were failing due to stale database connections that timed out between job executions, causing "server closed the connection unexpectedly" errors. The background scheduler was attempting to reuse database connections that had been closed by the server, preventing the notification process from fetching users and warranties.
  - **Root Cause:** The scheduled job was not properly managing database connection lifecycle, leading to attempts to use stale connections that had timed out between job runs.
  - **Solution:** Refactored the `send_expiration_notifications()` function to acquire a fresh database connection at the start of each job execution and ensure its proper release in a try/finally block. The connection is now managed for the entire job duration, preventing stale connection issues.
  - **Impact:** Scheduled notifications (both Email and Apprise) now execute reliably without database connection errors. The notification system is more stable and robust for long-running background processes.
  - _Files: `backend/notifications.py`_

- **Definitive Fix for Notification Scheduler Logic Across All Memory Modes:** Fixed critical issue where the notification scheduler logic was not robust enough to handle all Gunicorn memory modes, resulting in either no notifications in single-worker mode ('ultra-light') or potential issues in multi-worker modes. The `should_run_scheduler()` function failed to properly distinguish between single-worker and multi-worker environments.
  - **Root Cause:** The function incorrectly treated the absence of `GUNICORN_WORKER_ID` environment variable as a reason to NOT run the scheduler, when in single-worker mode this variable is not set and the scheduler should run.
  - **Solution:** Implemented explicit logic to handle two distinct cases: (1) Multi-worker environment where `worker_id` is set - only worker '0' runs scheduler, (2) Single-worker environment where `worker_id` is None - the single worker must run the scheduler.
  - **Impact:** The notification scheduler now works reliably across all memory modes: 'ultra-light' (single worker), 'optimized' (2 workers), and 'performance' (4 workers). Exactly one scheduler instance runs regardless of configuration, ensuring consistent notification delivery.
  - _Files: `backend/notifications.py`_

## 0.10.1.8 - 2025-07-22

### Fixed
- **Notification System Initialization:** Fixed critical issue where warranty expiration notifications were not working due to scheduler initialization failures in Docker ultra-light mode.
  - **Root Cause:** The notification scheduler initialization code was located in `backend/app.py` but Gunicorn was using the application factory pattern from `backend/__init__.py`, causing the scheduler to never be initialized. Additionally, the scheduler detection logic incorrectly identified single-worker ultra-light mode as multi-worker, preventing scheduler startup. Missing API endpoints `/api/timezones` and `/api/locales` were causing frontend errors and preventing proper settings configuration.
  - **Solution:** Moved scheduler initialization into the `create_app()` factory function to ensure it runs during application startup. Enhanced `should_run_scheduler()` detection logic to properly handle ultra-light mode with single sync worker. Added missing `/api/timezones` endpoint returning timezone data grouped by region (including America/Halifax) and `/api/locales` endpoint returning supported languages. Fixed timezone API to return array format expected by frontend and removed authentication requirement from locales endpoint for public access. Implemented comprehensive memory mode compatibility ensuring scheduler works correctly across all deployment configurations.
  - **Impact:** Notification scheduler now properly initializes and runs in all Docker memory modes (ultra-light, optimized, and performance). In multi-worker modes, only worker-0 runs the scheduler to prevent conflicts and resource waste. Automatic warranty expiration notifications work correctly, checking every 2 minutes for warranties to notify about. Settings page timezone and language dropdowns now load properly. Admin "Check Scheduler Status" button shows `scheduler_running: true` and active notification jobs. Manual notification testing via admin panel now functions correctly across all memory configurations.
  - _Files: `backend/__init__.py`, `backend/notifications.py`, `backend/warranties_routes.py`_

- **Mobile Button Text Overflow:** Fixed an issue where the "Manage Tags" button text would overflow on smaller mobile screens. The text is now hidden on screens narrower than 480px, showing only the icon to save space.
  - _Files: `frontend/mobile-header.css`_

  - **Mobile List View Optimization:** Fixed oversized warranty cards in list view on mobile browsers that were causing poor user experience with excessive scrolling and large interface elements.
  - **Root Cause:** The list view was using desktop-sized elements on mobile devices, including 180px × 180px product images, excessive padding, and large text that made warranty cards too large for mobile viewports.
  - **Solution:** Implemented comprehensive mobile-specific CSS optimizations with progressive size reduction across different screen sizes. Added responsive image sizing (80px → 60px → 50px for 768px → 480px → 360px screens), reduced card spacing and padding, optimized text and icon sizes, changed warranty info layout from horizontal to vertical on mobile, and disabled hover transforms that caused layout jumping on touch devices.
  - **Impact:** Warranty cards in list view are now significantly more compact and mobile-friendly. Users can now comfortably browse warranties on mobile devices without excessive scrolling. The interface adapts progressively to different mobile screen sizes while maintaining full functionality and readability.
  - _Files: `frontend/mobile-header.css`, `frontend/style.css`_

## 0.10.1.7  - 2025-07-20

### Fixed
- **Configuration Precedence Fix:** Fixed critical issue where environment variables were being ignored in favor of database settings on fresh installations, preventing proper configuration of OIDC, Apprise, and email settings via environment variables.
  - **Root Cause:** The configuration loading logic was checking database settings first, and since migration scripts insert default values (e.g., `oidc_enabled: 'false'`), the code would use these database values instead of checking environment variables. This violated the expected precedence hierarchy and made it impossible to configure the application via `.env` files on fresh deployments. Additionally, the `/api/auth/oidc-status` endpoint was not using the same precedence logic, causing the frontend to show "SSO is not enabled" even when users configured OIDC in the GUI but had conflicting environment variables.
  - **Solution:** Updated configuration loading in `init_oidc_client()`, `_load_configuration()`, email base URL handling, and OIDC status endpoint to follow proper precedence: Environment Variable > Database Setting > Hardcoded Default. Fixed all OIDC settings (`OIDC_ENABLED`, `OIDC_PROVIDER_NAME`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPE`), all Apprise settings (`APPRISE_ENABLED`, `APPRISE_URLS`, `APPRISE_EXPIRATION_DAYS`, `APPRISE_NOTIFICATION_TIME`, `APPRISE_TITLE_PREFIX`), and email base URL (`APP_BASE_URL`) to check environment variables first using proper `if env_var is not None:` logic. Updated the `get_oidc_status_route()` function to apply the same precedence logic as the backend initialization.
  - **Impact:** Environment variables now take precedence over database settings as expected. Fresh installations can be properly configured using Docker `.env` files. OIDC SSO, Apprise notifications, and email links now work correctly when configured via environment variables. The frontend SSO button now correctly reflects the actual OIDC configuration state. Existing deployments using database settings continue to work unchanged.
  - _Files: `backend/__init__.py`, `backend/apprise_handler.py`, `backend/auth_routes.py`, `backend/notifications.py`, `backend/oidc_handler.py`_

- **PostgreSQL Migration Permission Fix:** Fixed migration failures on standard PostgreSQL user setups that don't have `CREATEROLE` privileges, preventing application startup with error "keine Berechtigung, um Rolle zu ändern" (no permission to alter role).
  - **Root Cause:** Migrations `009z_grant_createrole_to_db_user.sql`, `010_configure_admin_roles.sql`, and `011_ensure_admin_permissions.sql` were attempting to grant `CREATEROLE` privileges and create admin roles, but these operations require superuser or `CREATEROLE` privileges that standard database users don't have. This caused migration failures on secure, standard PostgreSQL setups.
  - **Solution:** Updated all role management migrations to use PostgreSQL `DO` blocks with exception handling. The migrations now attempt advanced role operations but gracefully continue with informative notices if permissions are insufficient. Core application functionality is preserved while optional advanced features are skipped when permissions don't allow them.
  - **Impact:** Applications can now successfully start and run on standard PostgreSQL user setups without requiring elevated database privileges. The application works fully with basic user permissions while optional role management features are gracefully disabled when not available. Migration errors no longer prevent application startup.
  - _Files: `backend/migrations/009z_grant_createrole_to_db_user.sql`, `backend/migrations/010_configure_admin_roles.sql`, `backend/migrations/011_ensure_admin_permissions.sql`_
  
- **Warranty Routes Refactoring:** Extracted all warranty-related functionality from main application file into dedicated Flask Blueprint for improved code organization and maintainability.
  - **Root Cause:** Warranty routes were contained within the main `app.py` file, making the codebase monolithic and harder to maintain as the application grew.
  - **Solution:** Created new `warranties_routes.py` Blueprint containing all 9 warranty routes including CRUD operations, CSV import, global view, and tag management. Updated route decorators from `@app.route()` to `@warranties_bp.route()`, registered blueprint with `/api` prefix, and resolved import issues for both Docker and development environments.
  - **Impact:** Reduced main application file by ~1,500 lines of code while maintaining 100% API compatibility. Warranty functionality is now properly isolated in a 1,589-line dedicated module, making future maintenance and feature development easier.
  - _Files: `backend/warranties_routes.py` (new), `backend/app.py`, `Dockerfile`_

- **Admin Routes Refactoring:** Extracted all administrative functionality from main application file into dedicated Flask Blueprint for improved code organization and maintainability.
  - **Root Cause:** Admin routes were scattered throughout the main `app.py` file, making the codebase harder to maintain and reducing code modularity.
  - **Solution:** Created new `admin_routes.py` Blueprint containing all 16 admin routes including user management, site settings, notifications, and Apprise integration. Updated route decorators from `@app.route()` to `@admin_bp.route()`, registered blueprint with `/api/admin` prefix, and ensured proper import handling for both Docker and development environments.
  - **Impact:** Reduced main application file by ~635 lines of code while maintaining 100% API compatibility. Admin functionality is now properly isolated and modularized, making future maintenance and feature development easier.
  - _Files: `backend/admin_routes.py` (new), `backend/app.py`, `Dockerfile`_

- **Statistics Routes Refactoring:** Extracted statistics functionality from main application file into dedicated Flask Blueprint for improved code organization and maintainability.
  - **Root Cause:** Statistics routes were embedded within the main `app.py` file, contributing to a monolithic codebase structure.
  - **Solution:** Created new `statistics_routes.py` Blueprint containing both statistics routes (`/api/statistics` and `/api/statistics/global`) along with the `convert_decimals()` helper function. Updated route decorators from `@app.route()` to `@statistics_bp.route()`, registered blueprint with `/api` prefix, and ensured proper import handling for both Docker and development environments.
  - **Impact:** Reduced main application file by ~390 lines of code while maintaining 100% API compatibility. Statistics functionality is now properly isolated, ensuring Status page dashboard continues working seamlessly.
  - _Files: `backend/statistics_routes.py` (new), `backend/app.py`, `Dockerfile`_

- **Tag Management Routes Refactoring:** Extracted all tag management functionality from main application files into dedicated Flask Blueprint for improved code organization and maintainability.
  - **Root Cause:** Tag management routes were scattered across multiple files (`app.py` and `warranties_routes.py`), making tag-related functionality harder to maintain and reducing code modularity.
  - **Solution:** Created new `tags_routes.py` Blueprint containing all 6 tag-related routes including direct tag management (`/api/tags` CRUD operations) and warranty-tag association (`/api/warranties/{id}/tags`). Updated route decorators from `@app.route()` and `@warranties_bp.route()` to `@tags_bp.route()`, registered blueprint with `/api` prefix, and ensured proper import handling for both Docker and development environments.
  - **Impact:** Reduced main application files by ~323 lines of code while maintaining 100% API compatibility. Tag functionality is now properly consolidated in a single 336-line dedicated module, making tag management operations easier to maintain and extend.
  - _Files: `backend/tags_routes.py` (new), `backend/app.py`, `backend/warranties_routes.py`, `Dockerfile`_

- **File Handling Routes Refactoring:** Extracted all file handling and Paperless-ngx integration functionality from main application file into dedicated Flask Blueprint for improved code organization and maintainability.
  - **Root Cause:** File handling routes and Paperless-ngx integration were embedded within the main `app.py` file, contributing to a monolithic codebase structure and making file-related functionality harder to maintain.
  - **Solution:** Created new `file_routes.py` Blueprint containing all 13 file-related routes including local file serving (`/api/files/<path:filename>`, `/api/secure-file/<path:filename>`, `/api/paperless-file/<int:paperless_id>`) and Paperless-ngx integration (`/api/paperless/upload`, `/api/paperless/test`, `/api/paperless/search`, `/api/paperless/tags`, `/api/paperless/debug`, `/api/paperless/test-upload`, `/api/paperless/debug-document/<int:document_id>`, `/api/paperless/cleanup-invalid`, `/api/paperless-search-and-link`, `/api/paperless/url`). Created shared `utils.py` module with `allowed_file()` function. Updated route decorators from `@app.route()` to `@file_bp.route()`, registered blueprint with `/api` prefix, and cleaned up unused imports (`secure_filename`, `send_from_directory`, `mimetypes`).
  - **Impact:** Reduced main application file by ~781 lines of code (from 1,769 to 988 lines) while maintaining 100% API compatibility. File handling and Paperless-ngx functionality is now properly isolated in a 933-line dedicated module, making file operations and third-party integrations easier to maintain and extend.
  - _Files: `backend/file_routes.py` (new), `backend/utils.py` (new), `backend/app.py`, `backend/warranties_routes.py`, `Dockerfile`_

- **Application Factory Pattern Implementation:** Implemented Flask Application Factory Pattern to transform the application architecture from a monolithic script to a professional, modular, and testable structure following Flask community best practices.
  - **Root Cause:** The application used a global Flask app object created at import time, making it difficult to test, configure for different environments, and maintain as the codebase grew. Configuration was scattered throughout `app.py`, extensions were initialized directly in the main module, and the application couldn't be easily instantiated for testing purposes.
  - **Solution:** Created centralized `config.py` with environment-specific configuration classes (Development, Production, Testing), unified `extensions.py` module for Flask extension initialization with lazy loading pattern, implemented `create_app()` factory function in `__init__.py` for on-demand application creation, and simplified `app.py` to a 42-line entry point that uses the factory. Updated Dockerfile to use `gunicorn "backend:create_app()"` command and fixed blueprint imports to use extensions module instead of the old app module.
  - **Impact:** Reduced main application file by ~1,101 lines of code (from 1,143 to 42 lines) while maintaining 100% API compatibility. Application now supports multiple environments (development/production/testing), can be easily tested with isolated app instances, follows Flask best practices with proper extension management, and provides a clean separation of concerns between configuration, extensions, application creation, and entry point logic.
  - _Files: `backend/config.py` (new), `backend/extensions.py` (enhanced), `backend/__init__.py` (enhanced), `backend/app.py` (simplified), `backend/auth_routes.py` (import fix), `Dockerfile`_

- **Missing API Endpoints After Refactoring:** Restored critical API endpoints that were accidentally removed during the Application Factory Pattern implementation, causing 404 errors in the frontend.
  - **Root Cause:** During the blueprint refactoring, two essential endpoints (`/api/currencies` and `/api/settings/global-view-status`) were removed from the application, causing the frontend to fail when loading currency data and checking global view permissions.
  - **Solution:** Added missing `/api/currencies` endpoint to `warranties_routes.py` returning comprehensive list of 85+ world currencies with symbols, codes, and names. Added missing `/api/settings/global-view-status` endpoint to `statistics_routes.py` to check global view permissions based on user admin status and site settings. Updated frontend currency loading functions in `script.js` and `settings-new.js` to include authentication tokens in requests.
  - **Impact:** Resolved 404 errors preventing currency dropdown population and global view functionality. Frontend now properly loads currency data and global view permissions with proper authentication.
  - _Files: `backend/warranties_routes.py`, `backend/statistics_routes.py`, `frontend/script.js`, `frontend/settings-new.js`_

- **Status Page Warranty Details Functionality:** Fixed status page warranty detail expansion that was failing due to missing API endpoint and frontend JavaScript errors.
  - **Root Cause:** The status page was attempting to fetch detailed warranty information from `/api/debug/warranty/{id}` endpoint that didn't exist, and the toast notification system had a null reference error when trying to add event listeners.
  - **Solution:** Added new `/api/debug/warranty/<int:warranty_id>` GET endpoint in `warranties_routes.py` that returns complete warranty details including serial numbers, tags, and user information with proper permission checks. Fixed toast function in `status.js` to safely check for element existence before adding event listeners. Enhanced status page to display both local and Paperless-ngx documents with proper visual indicators.
  - **Impact:** Status page warranty rows now expand properly when clicked, showing detailed warranty information, documents, and serial numbers. Toast notifications work without JavaScript errors.
  - _Files: `backend/warranties_routes.py`, `frontend/status.js`_

- **Paperless-ngx Document Visibility on Warranty Cards:** Fixed issue where documents added from Paperless-ngx weren't appearing on warranty cards in the main view, despite being properly stored and visible in edit modals.
  - **Root Cause:** The frontend logic for determining whether to show the document links section (`hasDocuments` calculation) only checked for local file paths but ignored Paperless-ngx document IDs. Status page document display also only showed local files.
  - **Solution:** Enhanced `hasDocuments` calculation in `script.js` to include Paperless-ngx document IDs (`paperless_invoice_id`, `paperless_manual_id`, `paperless_photo_id`, `paperless_other_id`) alongside local file paths. Updated status page document display logic to show both local and Paperless-ngx documents with cloud icon indicators. Exposed `openPaperlessDocument` and `openSecureFile` functions to window object for global access.
  - **Impact:** Warranty cards now properly display document links when Paperless-ngx documents are attached. Users can access both local files and Paperless-ngx documents from warranty cards and status page, with visual distinction between storage types.
  - _Files: `frontend/script.js`, `frontend/status.js`_

## 0.10.1.6  - 2025-07-13

### Fixed
- **Warranty Card Layout Improvement:** Moved warranty status row to the bottom of warranty cards in both grid and list views for better visual hierarchy and consistent card structure.
  - **Root Cause:** Status information appeared in the middle of warranty cards, breaking visual flow.
  - **Solution:** Relocated warranty status row to appear after document links and tags at the bottom of each card.
  - **Impact:** Improved card readability and consistent layout across all view modes.
  - _Files: `frontend/script.js`_

- **Tag Management Real-Time Updates:** Fixed issue where tag changes (color updates, name changes) in the manage tags modal did not immediately reflect in warranty cards and UI elements.
  - **Root Cause:** Tag updates only refreshed the management modal but not the main warranty display or related UI components.
  - **Solution:** Enhanced updateTag() and deleteTag() functions to update all UI elements including warranty cards, selected tags, filter dropdowns, and edit forms.
  - **Impact:** Tag changes now appear instantly throughout the application without requiring page refresh.
  - _Files: `frontend/script.js`_

- **Missing Tag-Related Translations:** Resolved issue where tag management success and error messages displayed as translation keys instead of localized text across all supported languages.
  - **Root Cause:** Tag-related message keys (tag_updated_successfully, tag_created_successfully, etc.) were missing from translation files.
  - **Solution:** Added complete set of tag management translations to all 17 language files including success messages, error messages, and validation text.
  - **Impact:** Users now see properly localized tag management messages in their preferred language.
  - **Languages Updated:** English, French, Spanish, German, Italian, Dutch, Russian, Czech, Portuguese, Japanese, Korean, Chinese (Simplified & Traditional), Hindi, Arabic, Persian, Ukrainian.
  - _Files: All `locales/*/translation.json` files_

- **Update Caching Issues:** Resolved errors during application updates caused by browser and service worker caching of outdated assets.
  - Configured `nginx.conf` with no-cache headers for `sw.js` to ensure fresh service worker loads on updates.
  - Updated service worker cache name in `frontend/sw.js` to 'warracker-cache-v20250119001' and added version parameters to all cached assets.
  - Incremented version query parameters (?v=20250119001) across all HTML files to force cache busting for CSS, JS, and other assets.
  - Temporarily added version parameter to service worker registration in `frontend/script.js`, removed after nginx configuration handles it going forward.
  - Verified complete removal of previous version strings and consistent application across all frontend files.

- **Database Migration Format String Errors:** Fixed critical migration failures preventing new Warracker instances from starting up due to PostgreSQL parameter format string conflicts in migration files.
  - **Root Cause:** Migration files `011_ensure_admin_permissions.sql` and `031_add_owner_role.sql` contained mixed parameter format styles that caused psycopg2 to fail with "argument formats can't be mixed" and "too many parameters specified for RAISE" errors. The issue occurred when Python-style parameter placeholders (`%(db_user)s`) were mixed with PostgreSQL format specifiers (`%`) in `RAISE NOTICE` statements within the same SQL file.
  - **Solution:** Fixed format string conflicts in `011_ensure_admin_permissions.sql` by escaping literal `%` characters as `%%` in `RAISE NOTICE` statements to avoid conflicts with Python parameter substitution. Fixed parameter count issues in `031_add_owner_role.sql` by correcting `RAISE NOTICE` statements to use proper single `%` for parameter placeholders instead of double `%%` which was causing parameter count mismatches.
  - **Impact:** New Warracker instances can now start up successfully without migration failures. All 42 database migrations (000 through 042) now complete successfully, allowing proper creation of the `site_settings` table and elimination of "relation 'site_settings' does not exist" errors during startup.
  - _Files: `backend/migrations/011_ensure_admin_permissions.sql`, `backend/migrations/031_add_owner_role.sql`_

_Files: `nginx.conf`, `frontend/sw.js`, `frontend/script.js`, all frontend HTML files (index.html, status.html, settings-new.html, login.html, register.html, reset-password-request.html, reset-password.html, about.html, auth-redirect.html, debug-export.html)_

- **Docker Compose Command Duplication Fix:** Resolved update issues by removing redundant migration and permission commands from the root `docker-compose.yml`, preventing duplicated execution and startup errors.

_Files: `docker-compose.yml`_

- **Flexible Date Parsing in CSV Import:** Enhanced CSV import to support multiple date formats for the PurchaseDate field using dateutil.parser, removing the strict YYYY-MM-DD requirement.
  - **Root Cause:** Import required exact YYYY-MM-DD format, failing on other common formats.
  - **Solution:** Replaced strict datetime.strptime with flexible dateutil.parser.parse in backend/app.py.
  - **Impact:** Users can now import warranties with various date formats without manual reformatting.
  - _Files: `backend/app.py`_

- **Warranty Duration Selection Limit:** Fixed limitation preventing selection above 11 months for warranty durations. Removed backend validation caps on months (<12) and days (<366), increased years limit to 999, and updated frontend input maximums to 999 months and 9999 days for flexible entry. Added migration to adjust database constraints accordingly.
  - _Files: `backend/app.py`, `frontend/index.html`, `frontend/status.html`, `backend/migrations/042_allow_higher_duration_components.sql`_
- **Paperless-ngx Duplicate Document Handling:** Added detection of duplicate documents during upload to Paperless-ngx. When a duplicate is found, the system automatically links to the existing document and displays an informative message to the user.
  - **Root Cause:** Previous implementation did not check for duplicates before upload, leading to generic error messages.
  - **Solution:** Added checksum-based duplicate check before upload in backend/paperless_handler.py and handled linking in frontend/script.js.
  - **Impact:** Users now get clear feedback about duplicates and automatic linking instead of upload failures.
  - _Files: `backend/paperless_handler.py`, `backend/app.py`, `frontend/script.js`_

  - **Database Migration Permission Fix:** Resolved 'no permission to create role' errors during initial setup by granting CREATEROLE privilege to the db_user in a new early migration and removing duplicate grants in later migrations. This ensures smooth database initialization without requiring superuser privileges.
  - _Files: `backend/migrations/009z_grant_createrole_to_db_user.sql`, `backend/migrations/011_ensure_admin_permissions.sql`_

- **Missing Translation for Warranty Addition Success Message:** Resolved issue where the success message displayed as a placeholder key ('messages.warranty_added_successfully') instead of the translated text.
  - Added the key and appropriate translations to all supported languages in `translation.json` files.
  - Updated English and French `.po` files for backend consistency.
  - Ensures proper localized success messages appear when adding warranties in any language.

  _Files: All `locales/*/translation.json`, `locales/en/LC_MESSAGES/messages.po`, `locales/fr/LC_MESSAGES/messages.po`_

- **Product Photo Loading Fix:** Fixed issue where product photos would disappear when navigating between pages, specifically when returning from the status page to the homepage.
  - **Root Cause:** The renderWarranties function was calling a non-existent `initializeSecureImages()` function, causing JavaScript errors that prevented secure image loading.
  - **Solution:** Replaced the incorrect `initializeSecureImages()` function call with the correct `loadSecureImages()` function.
  - **Impact:** Product photos now load consistently across all page navigation scenarios with proper authentication.
  - _Files: `frontend/script.js`_

## 0.10.1.5  - 2025-07-08

### Enhanced
- **Comprehensive Cache Busting Implementation:** Updated all frontend assets with consistent cache versioning to ensure users receive the latest files immediately.
  - **Unified Cache Version:** Applied consistent cache busting version `v=20250118001` across all frontend assets:
    - **CSS Files:** `style.css`, `settings-styles.css`, `header-fix.css`, `mobile-header.css`
    - **JavaScript Files:** `script.js`, `auth.js`, `settings-new.js`, `status.js`, `theme-loader.js`, `footer-fix.js`, `footer-content.js`
    - **Authentication Scripts:** `auth-redirect.js`, `registration-status.js`, `file-utils.js`, `include-auth-new.js`, `fix-auth-buttons-loader.js`
    - **Internationalization:** `js/i18n.js`, `js/i18n-debug.js`, and all i18next library files
    - **Chart Library:** `chart.js`
  - **Complete HTML Coverage:** Updated cache busting across all application pages:
    - **Main Pages:** `index.html`, `status.html`, `settings-new.html`
    - **Authentication Pages:** `login.html`, `register.html`, `reset-password.html`, `reset-password-request.html`
    - **Utility Pages:** `about.html`, `auth-redirect.html`, `debug-export.html`
  - **Service Worker Integration:** Updated Progressive Web App caching with new cache name `warracker-cache-v20250118001`:
    - **Cache Name Update:** Incremented service worker cache version to force cache refresh
    - **Asset Registry:** Added all cache-busted files to service worker's cached asset list
    - **Cache Invalidation:** Old cached versions automatically cleared on service worker activation
  - **Performance Benefits:**
    - **Immediate Updates:** Users automatically receive latest file versions without manual cache clearing
    - **Consistent Experience:** Eliminates mixed version issues from partial cache updates
    - **Developer Control:** Simplified cache management for future deployments
    - **PWA Compatibility:** Service worker properly synchronized with new asset versions
  - _Files: All HTML files, `frontend/sw.js`_

### Added
- **Multi-Language Support Expansion:** Warracker now provides comprehensive internationalization support with **17 languages**, making warranty management accessible to users worldwide.
  - **Complete Localization Coverage:** Full application translation including UI elements, navigation, settings, status pages, and user messaging across all supported languages
  - **Right-to-Left (RTL) Language Support:** Native RTL text direction support for Arabic and Persian languages with proper layout adjustments
  - **Supported Languages:**
    - **Arabic (ar)** – *RTL Support*
    - **Czech (cs)** – Čeština
    - **German (de)** – Deutsch  
    - **English (en)** – English *(Default)*
    - **Spanish (es)** – Español
    - **Persian (fa)** – فارسی *(RTL Support)*
    - **French (fr)** – Français
    - **Hindi (hi)** – हिन्दी
    - **Italian (it)** – Italiano
    - **Japanese (ja)** – 日本語
    - **Korean (ko)** – 한국어
    - **Dutch (nl)** – Nederlands
    - **Portuguese (pt)** – Português
    - **Russian (ru)** – Русский
    - **Ukrainian (uk)** – Українська
    - **Chinese (Simplified) (zh_CN)** – 简体中文
    - **Chinese (Hong Kong) (zh_HK)** – 繁體中文 (香港)
  - **Language Selection Features:**
    - **Auto-Detection:** Browser language automatically detected on first visit
    - **User Preference:** Individual language selection saved to user profile
    - **Native Names:** Language dropdown displays options in their native scripts for better user recognition
    - **Instant Switching:** Real-time language changes without page reload

## Frontend Enhancements

* Language dropdown updated to list all 17 languages using native names.
* UI elements across navigation, settings, and status pages are fully localized.
* Translation files updated with keys for status, warranties, and user settings.
* Full support for pluralization and dynamic content in all languages.

  * *Files: `frontend/js/i18n.js`, `frontend/settings-new.html`, `frontend/status.js`, `frontend/status.html`, `frontend/version-checker.js`*

## Backend and Database Updates

* Language code validation extended to all 17 languages in user preference APIs.
* Database constraints updated to allow the new language codes.

  * *Files: `backend/auth_routes.py`, `backend/app.py`, `backend/localization.py`, `backend/migrations/039_update_language_constraint.sql`, `backend/migrations/041_update_language_constraint_again.py`*

## Translation Files

* New translation files added for all supported languages under `locales/`.
* All existing translation files updated to include standardized language names.
* Gettext `.po` files updated to reflect new keys.

  * *Files: `locales/*/translation.json`, `locales/*/LC_MESSAGES/messages.po`, `scripts/manage_translations.py`, `run_language_migration.py`*

## Status Page Localization

* Status dashboard, chart labels, and table headers are fully translatable.
* Dynamic labels (e.g., warranty statuses, chart titles, empty states) now reflect the selected language.
* Proper pluralization support implemented for all time-based units.
* Missing or inconsistent keys added across all language files:

  * `dashboard_title`, `global_dashboard_title`, `overview`
  * `purchase_date`, `expiration_date`, `status`, `expiring_soon`
  * `recent_expirations_empty`, `active`, and others
  * *Files: `frontend/status.js`, `locales/*/translation.json`*

### Fixed

- **Paperless-ngx Auto-Linking After Add Warranty:** Fixed an issue where uploading invoices or manuals to Paperless-ngx when adding a new warranty did not automatically link the documents to the warranty (auto-link/search logic was not triggered). Now, after adding a warranty, any uploaded Paperless-ngx documents (invoice or manual) are automatically searched and linked, matching the behavior of the edit warranty modal. This works for both invoices and manuals, provided their storage is set to "paperless".
  - **Root Cause:** The auto-link logic was running after the form reset, which cleared file inputs and prevented document linking.
  - **Solution:** The auto-link logic now runs before the form reset, using pre-upload file info and storage type to ensure correct document association.
  - **Impact:** Users can now add warranties and have their uploaded Paperless-ngx invoices/manuals automatically linked, just like in the edit modal.
  - _Files: `frontend/script.js`_

- **Toast Error Adding Warranty:** When skipping a missing field in a form, the application now displays only a single warning message instead of multiple repeated warnings. This improves user experience by preventing redundant alerts when required fields are missing or skipped.

## 0.10.1.4  - 2025-06-24

### Enhanced
- **Warranty Card Information Display Improvements:** Redesigned warranty card layout with clean icon-based display and improved visual organization.
  - **Icon-Based Information Display:** Added intuitive icons to warranty information for better visual scanning:
    - 📅 Calendar icon for Product Age
    - 📄 Document icon for Warranty Duration  
    - 🔧 Wrench icon for Warranty End Date
    - 🪙 Coins icon for Purchase Price
    - 📊 Barcode icon for Serial Number
    - 🏪 Store icon for Vendor
    - 🛡️ Shield icon for Warranty Type
  - **Reorganized Information Order:** Reordered warranty details for logical information hierarchy:
    - Age → Warranty Duration → Warranty End Date → Price → Serial Number → Vendor → Type
  - **Layout Improvements:**
    - Fixed text overlapping with product photo thumbnails by removing right-alignment
    - Values now positioned close to labels with consistent spacing
    - Applied improvements across all view modes (grid, list, table)
  - **Visual Enhancements:**
    - Added light grey background (#f5f5f5) to product photo thumbnails
    - Dark mode photo backgrounds use #2a2a2a for proper contrast
    - Improved serial number display - first serial shown inline, additional ones in list below
  - _Files: `frontend/script.js`, `frontend/style.css`_

### Added
- **Paperless-ngx Document Browser:** Complete GUI interface for browsing and selecting documents from Paperless-ngx in warranty forms.
  - **Interactive Document Browser:** Added comprehensive document browser modal accessible from warranty add/edit forms:
    - **Browse Buttons:** Added "Browse Paperless" buttons for invoice and manual document selection in warranty forms
    - **Search and Filter:** Full-text search across document titles and content with tag-based filtering capabilities
    - **Pagination Support:** Efficient pagination for large document collections with configurable page sizes
    - **Document Selection:** Single-click document selection with visual confirmation and selection state management
  - **Backend API Enhancements (`backend/app.py`):** Added `/api/paperless/tags` endpoint for document filtering:
    - **Tag Retrieval:** Fetches available tags from Paperless-ngx for filter dropdown population
    - **Authentication:** Properly authenticated endpoint with user permission validation
    - **Error Handling:** Comprehensive error handling for Paperless-ngx connection issues
  - **Frontend Integration (`frontend/index.html`, `frontend/script.js`, `frontend/style.css`):**
    - **Modal Interface:** Large, responsive document browser modal with search bar, filters, and document grid
    - **Document Display:** Clean document cards showing title, creation date, tags, and selection status
    - **Form Integration:** Selected documents automatically populate warranty form fields with document IDs
    - **Mobile Responsive:** Optimized layout for mobile devices with appropriate touch targets
    - **Visual Feedback:** Loading states, error messages, and success confirmations for all operations
  - **User Experience Features:**
    - **Conditional Visibility:** Browse buttons only appear when Paperless-ngx is enabled and configured
    - **Real-time Search:** Instant search results as users type in the search field
    - **Tag Filtering:** Multi-select tag filter for refined document discovery
    - **Keyboard Navigation:** Full keyboard support for accessibility
    - **Cache Management:** Intelligent caching of document lists and tags for improved performance
  - _Files: `backend/app.py`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

- **Paperless-ngx Document Viewing Preference:** Added user preference to view Paperless documents within Warracker instead of opening in Paperless domain.
  - **User Preference Setting:** Added "View Documents in Warracker" toggle in Paperless-ngx settings section:
    - **Individual Choice:** Each user can choose their preferred document viewing method between Warracker interface or Paperless-ngx instance
    - **Dual Viewing Options:** Users can view documents either within Warracker's interface or directly in the Paperless-ngx web interface
    - **Persistent Setting:** Preference saved to user preferences database and localStorage
    - **Immediate Effect:** Setting changes apply immediately without requiring page refresh
  - **Database Schema (`backend/migrations/037_add_paperless_view_in_app_preference.sql`):** Added `paperless_view_in_app` boolean column to `user_preferences` table:
    - **Default Value:** Set to FALSE (open in Paperless-ngx domain) for backward compatibility
    - **User-Specific:** Each user maintains their own viewing preference independently
  - **Backend API Integration (`backend/auth_routes.py`):** Enhanced user preferences endpoints:
    - **GET /api/auth/preferences:** Returns paperless viewing preference with proper fallback handling
    - **PUT /api/auth/preferences:** Validates and saves paperless viewing preference with boolean validation
    - **Default Handling:** All preference responses include paperless_view_in_app with appropriate defaults
  - **Frontend Implementation (`frontend/script.js`, `frontend/settings-new.html`, `frontend/settings-new.js`):**
    - **Document Opening Logic:** Modified `openPaperlessDocument()` function to check user preference
    - **Warracker Viewing:** When enabled, documents open via `/api/paperless-file/{id}` endpoint within Warracker interface
    - **Paperless-ngx Viewing:** When disabled, documents open directly in the Paperless-ngx web interface at the configured instance URL
    - **Authentication Handling:** Proper token authentication for in-app document viewing with query parameter support
    - **Fallback Support:** Graceful fallback to Paperless-ngx domain if in-app viewing fails
    - **Settings UI:** Toggle switch in Paperless-ngx settings section with clear description of both viewing options
  - **Security Features:**
    - **Token Authentication:** Documents accessed through Warracker maintain proper user authentication
    - **Permission Validation:** Backend validates user access rights before serving documents
    - **Secure Token Passing:** Authentication tokens properly encoded in query parameters for secure access
  - _Files: `backend/migrations/037_add_paperless_view_in_app_preference.sql`, `backend/auth_routes.py`, `frontend/script.js`, `frontend/settings-new.html`, `frontend/settings-new.js`_

## 0.10.1.3  - 2025-06-17

### Added
- **Paperless-ngx Document Management Integration:** Complete integration with Paperless-ngx for advanced document management and storage capabilities.
  - **Settings Page Configuration:** Added Paperless-ngx configuration section in admin settings allowing administrators to:
    - **Connection Setup:** Configure Paperless-ngx server URL and API token for secure integration
    - **Test Connection:** Built-in connection testing to verify Paperless-ngx server accessibility and authentication
    - **Enable/Disable Toggle:** Master switch to activate or deactivate Paperless-ngx integration across the application
  - **Hybrid Storage System (`backend/app.py`):** Implemented intelligent document storage with per-document storage choice:
    - **Storage Selection:** Users can choose between local storage and Paperless-ngx for each document type (invoice, manual, photos, other documents)
    - **Smart File Handling:** Documents are stored exclusively in chosen location (prevents dual storage)
    - **Database Integration:** Paperless document IDs properly tracked in database fields (`paperless_invoice_id`, `paperless_manual_id`, etc.)
    - **Automatic Cleanup:** When switching storage methods, old files are automatically removed from previous location
  - **Visual Document Identification:** Enhanced warranty cards with clear visual indicators for document storage location:
    - **Cloud Icons:** Blue cloud icons (🌤️) appear next to documents stored in Paperless-ngx for instant recognition
    - **Local Document Icons:** Standard document icons for locally stored files
    - **Mixed Storage Support:** Warranties can have documents stored in both locations with appropriate visual indicators
  - **Add/Edit Warranty Integration:** Full Paperless-ngx support in both add and edit warranty workflows:
    - **Storage Option Selection:** Radio buttons for each document type allowing users to choose storage location
    - **Seamless Upload Process:** Files uploaded to Paperless-ngx are automatically tagged and organized
    - **Edit Modal Parity:** Edit warranty modal has identical Paperless-ngx functionality to add warranty modal
  - **Document Access Integration:** Direct access to Paperless-ngx documents through warranty interface with secure authentication
  - _Files: `backend/app.py`, `frontend/script.js`, `frontend/settings-new.html`, `frontend/settings-new.js`_

### Fixed
- **Application Loading Performance:** Eliminated empty warranty list flash during login by preventing premature rendering before data is loaded.
  - **Loading State Management:** Added `warrantiesLoaded` flag to track when warranty data has been successfully fetched from the API
  - **Render Prevention:** Modified `switchView()` function to skip rendering warranties until data is actually loaded from the server
  - **Smooth User Experience:** Users now see warranties appear directly without the brief flash of empty content during authentication
  - **State Synchronization:** Warranty loading flag properly reset on load start and error conditions to maintain accurate state
  - **Initialization Flow:** View preference loading no longer triggers empty warranty rendering during page initialization
  - _Files: `frontend/script.js`_

- **Settings Page Horizontal Scrollbar:** Eliminated horizontal scrollbar issue on the settings page that was causing unwanted left-right scrolling.
  - **Footer Overflow Fix:** Replaced problematic viewport width calculations (`100vw`) with standard width (`100%`) in `.warracker-footer` class to prevent horizontal overflow
  - **Margin Calculation Fix:** Removed `calc(-50vw + 50%)` margin calculations that were causing overflow beyond viewport boundaries
  - **Global Overflow Prevention:** Added `overflow-x: hidden` to `html`, `body`, and `.content-wrapper` elements to prevent any horizontal scrolling
  - **Grid Responsiveness:** Reduced minimum column width from `200px` to `150px` in admin actions, apprise actions, and status grid layouts for better mobile compatibility
  - **Text Handling:** Added `word-wrap: break-word` and `box-sizing: border-box` to form controls and cards to prevent text overflow
  - **Cross-Device Compatibility:** Settings page now displays properly without horizontal scrollbars on all screen sizes and devices
  - _Files: `frontend/settings-styles.css`_


##  0.10.1.2 - 2025-06-16

### Fixed
- **First User Registration Issue on Fresh Instances:** Fixed critical bug preventing first user registration on newly deployed applications
  - **Logger Import Fix (`backend/auth_routes.py`):** Fixed undefined logger error in registration endpoint that was causing 500 Internal Server Error during user creation
  - **Database Migration Timing Fix (`backend/app.py`):** Enhanced owner existence check to handle cases where `is_owner` column doesn't exist yet during application startup, preventing column lookup errors during migration sequence
  - **Graceful Migration Handling:** Added proper column existence verification and exception handling for migration timing edge cases
  - **Error Resolution:** Eliminates "name 'logger' is not defined" and "column 'is_owner' does not exist" errors during fresh deployment registration

##  0.10.1.1 - 2025-06-15

### Added
- **Export Debug Tools**: Comprehensive debugging system for troubleshooting warranty export issues
  - **Debug Page**: Created `frontend/debug-export.html` for interactive export testing and analysis
  - **Debug API**: Added `/api/debug/export` endpoint providing detailed warranty and association data
  - **Enhanced Logging**: Added comprehensive debug logging to export and filter functions in `frontend/script.js`
  - **Export Validation**: Real-time display of filter application and warranty count verification
  - **Interactive Testing**: Browser-based tool to test export functionality with detailed console output
  - **Filter Analysis**: Step-by-step debugging of each filter application to identify export count discrepancies
- **Currency Position Control:** Enhanced currency display system to allow users to choose whether currency symbols appear on the left or right of numbers through the settings page.
  - **Settings UI Enhancement (`frontend/settings-new.html`):** Added new "Currency Position" dropdown in Display Preferences section:
    - **Left Position:** Traditional format like "$100.00" (default to maintain existing behavior)
    - **Right Position:** European-style format like "100.00$"
    - **Visual Examples:** Dropdown options show example formatting to clarify choice impact
  - **Database Schema (`backend/migrations/034_add_currency_position_column.sql`):** Added `currency_position` column to `user_preferences` table:
    - **Default Value:** Set to 'left' for backward compatibility with existing installations
    - **Data Validation:** Check constraint ensures only 'left' or 'right' values are allowed
    - **Migration Safety:** Handles existing data by setting NULL or invalid values to 'left' before applying constraint
  - **Backend API Integration (`backend/auth_routes.py`):** Enhanced user preferences endpoints to handle currency position:
    - **GET /api/auth/preferences:** Returns saved currency position preference with 'left' fallback for missing values
    - **PUT /api/auth/preferences:** Validates and saves currency position with input validation for 'left'/'right' values
    - **Default Handling:** All default preference objects include currency_position: 'left' for consistency
  - **Frontend Dynamic Formatting (`frontend/script.js`):** Implemented responsive currency display system:
    - **New Functions:** Added `getCurrencyPosition()` and `formatCurrencyHTML()` for position-aware currency formatting
    - **Smart HTML Generation:** Currency symbols and amounts dynamically positioned based on user preference
    - **CSS Integration:** Right-positioned symbols use `.currency-right` class for proper spacing
    - **Live Updates:** Real-time updates when position preference changes without page refresh
  - **Universal Application:** Currency position setting applies across all views and features:
    - **Warranty Cards:** Grid, list, and table views all respect position preference
    - **Price Displays:** Purchase price fields show currency in chosen position throughout application
    - **Cross-Tab Sync:** Settings changes immediately reflect in all open browser tabs
  - **User Experience Features:**
    - **Immediate Preview:** Position changes apply instantly to warranty cards when settings are saved
    - **Persistent Preference:** Setting saved per user in database and persists across sessions
    - **Backward Compatible:** Existing users see no change (defaults to left position)
    - **Storage Event Handling:** Settings page and main app stay synchronized when currency position changes
  - **CSS Styling (`frontend/style.css`):** Added `.currency-right` class for proper margin spacing when symbols appear on the right
  - **Form Currency Integration:** Enhanced warranty add/edit forms to respect currency position settings:
    - **Dynamic Form Updates:** Price input fields in both add and edit warranty forms now show currency symbols in the user's preferred position
    - **CSS Form Positioning:** Added `.price-input-wrapper.currency-right` styles to properly position currency symbols on the right side of input fields
    - **Input Padding Adjustment:** Right-positioned currency symbols get appropriate padding to prevent text overlap
    - **Dynamic Currency Positioning:** JavaScript-based dynamic positioning system that places right-side currency symbols immediately after the typed content, maintaining natural spacing regardless of input length
    - **Modal Currency Positioning:** Enhanced currency positioning to work immediately when modals open, not just when users interact with input fields
    - **Modal Integration:** Currency position updates automatically when forms are opened, ensuring immediate visual consistency
    - **Summary Tab Enhancement:** Add warranty form summary tab now displays purchase price with correct currency positioning
    - **Improved Dynamic Positioning:** Enhanced JavaScript positioning system with better timing and reliability:
      - **Element Readiness Validation:** Added checks to ensure DOM elements are fully rendered before positioning calculations
      - **Multiple Timing Mechanisms:** Uses `requestAnimationFrame()` with fallback timers for robust positioning across different browsers
      - **Automatic Modal Triggers:** Currency positioning now activates immediately when modals open via simulated focus/blur events
      - **Debug Logging:** Added console logging for positioning calculations to aid in troubleshooting
      - **Retry Logic:** Automatic retry mechanism if elements aren't ready during initial positioning attempt
  - _Files: `backend/migrations/034_add_currency_position_column.sql`, `backend/auth_routes.py`, `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/script.js`, `frontend/style.css`, `frontend/index.html`_
- **OIDC-Only Login Mode:** Added administrator control to enforce OIDC-only authentication, hiding traditional username/password login forms.
  - **Database Setting:** Added `oidc_only_mode` boolean setting to `site_settings` table with default value 'false' for backward compatibility
  - **Backend API Enhancement (`backend/app.py`):** 
    - **Settings Management:** Added `oidc_only_mode` to site settings GET/PUT endpoints with proper boolean validation
    - **OIDC Status API:** Enhanced `/api/settings/oidc-status` endpoint to include `oidc_only_mode` status for frontend consumption
  - **OIDC Handler Update (`backend/oidc_handler.py`):** Updated `/api/auth/oidc-status` route to return OIDC-only mode status alongside provider information
  - **Frontend Admin Controls (`frontend/settings-new.html`, `frontend/settings-new.js`):**
    - **Settings UI:** Added "OIDC-Only Login Mode" toggle in OIDC SSO Configuration section with warning about proper configuration
    - **Settings Persistence:** OIDC-only mode preference saved to backend and loaded with other OIDC settings
    - **Element Management:** Added DOM element handling for the new toggle in both global and local scopes
  - **Login Page Enhancement (`frontend/login.html`):**
    - **Conditional UI:** Traditional username/password login form hidden when OIDC-only mode is enabled
    - **Link Management:** Register and forgot password links hidden in OIDC-only mode as they're not applicable
    - **Page Title Update:** Login page title changes to "Login with SSO" when in OIDC-only mode
    - **Clean Interface:** OR separator and auth links section hidden when not needed
  - **Security Benefits:** Enforces single sign-on authentication when enabled, preventing local account access and centralizing authentication through OIDC provider
  - **Administrator Safety:** Includes warning message about ensuring OIDC is properly configured before enabling this mode to prevent lockouts
  - _Files: `backend/app.py`, `backend/oidc_handler.py`, `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/login.html`_
- **About Page Redesign:** Complete visual overhaul of the about page with modern design, improved layout, and enhanced community links.
  - **Hero Section Enhancement:** Added gradient background hero section with prominent Warracker branding, version display, and descriptive text about the platform
  - **Modern Card Layout:** Restructured content into three themed information cards:
    - **Project Information Card:** GitHub repository and releases links with proper GitHub branding
    - **Community & Support Card:** Discord community invitation and issue reporting links
    - **Developer Information Card:** Developer profile and license information with appropriate icons
  - **Discord Community Integration:** Added prominent Discord community link (https://discord.gg/PGxVS3U2Nw) with official Discord branding:
    - **Discord Icon:** Proper `fab fa-discord` Font Awesome icon implementation
    - **Brand Colors:** Discord's signature #5865f2 color scheme with hover effects
    - **Community Focus:** Positioned prominently in Community & Support section
  - **Enhanced Social Links:** Improved all external links with proper icons and brand-appropriate styling:
    - **GitHub Links:** `fab fa-github` icons for repository and developer profile
    - **Issue Reporting:** `fas fa-bug` icon with red accent color for bug reports
    - **Releases:** `fas fa-tags` icon with blue accent color for version releases
    - **License:** `fas fa-balance-scale` icon with green accent color for AGPL-3.0 license
  - **Visual Improvements:** Modern design elements with enhanced user experience:
    - **Hover Effects:** Smooth card lift animations and social link transitions
    - **Responsive Design:** Grid layout that adapts to mobile devices with single-column layout
    - **Dark Mode Support:** Proper styling for both light and dark themes with appropriate contrast
    - **Color-Coded Interface:** Each social link uses brand-appropriate colors for visual consistency
  - **Update Status Enhancement:** Redesigned update checker section with better visual hierarchy and icon integration
  - **Support Section:** Improved "Buy me a coffee" section with better visual presentation and clear call-to-action
  - **Mobile Optimization:** Responsive design with adjusted font sizes, centered layouts, and flexible social link sizing for optimal mobile experience
  - _Files: `frontend/about.html`_
- **Global View Photo Access:** Enhanced secure file access to allow users to view product photos from other users' warranties when global view is enabled.
  - **Photo Sharing in Global View:** When global view is enabled for all users, product photo thumbnails and full-size images are now accessible across all warranties, not just user-owned ones
  - **Selective File Access:** Only product photos are granted global view access - invoices, manuals, and other sensitive documents remain restricted to warranty owners and admins
  - **Respects Global View Settings:** Photo access follows the same permission model as the global warranties feature:
    - **Global View Enabled:** Photos accessible to all authenticated users when global view is active
    - **Admin-Only Mode:** When global view is restricted to admins only, photo access is similarly restricted
    - **Disabled Mode:** When global view is disabled, photos revert to owner-only access
  - **Enhanced Security Logging:** Added comprehensive logging to secure file access endpoint for troubleshooting and security auditing of photo access requests
  - **Backend Implementation (`backend/app.py`):** Modified `/api/secure-file/<path:filename>` endpoint with additional authorization logic:
    - **Product Photo Detection:** Queries database to identify if requested file is a product photo vs other document types
    - **Permission Validation:** Checks global view settings and user permissions before granting access
    - **Maintains Existing Security:** All current access controls remain intact - admins and owners retain full access
  - **User Experience:** Product photos now display properly in global view across all viewing modes (grid, list, table), enabling visual identification of products from all users
  - _Files: `backend/app.py`_
- **Super-Admin (Owner) Role with Ownership Transfer:** Implemented a comprehensive ownership management system with immutable owner role and secure ownership transfer functionality.
  - **Database Schema Enhancement (`backend/migrations/031_add_owner_role.sql`):** Added `is_owner` boolean column to users table with automatic owner promotion for the first registered user
  - **Backend API Protection (`backend/app.py`, `backend/auth_routes.py`, `backend/auth_utils.py`):** 
    - **Owner Protection Logic:** Prevents owner account deletion, demotion, or deactivation through all admin endpoints
    - **Authentication Enhancement:** Added `is_owner` field to all authentication responses and token validation
    - **Backward Compatibility:** Implemented graceful fallback handling for systems without the owner column
    - **Transaction Rollback Handling:** Added proper PostgreSQL transaction rollback recovery for failed queries
  - **Ownership Transfer API (`backend/app.py`):** New `/api/admin/transfer-ownership` endpoint with atomic transaction processing:
    - **Security Validation:** Requires "TRANSFER" confirmation text and validates target user is an active admin
    - **Atomic Operations:** Uses database transactions to ensure ownership transfer completes fully or rolls back entirely
    - **Owner-Only Access:** Restricted to current owner with comprehensive permission checks
  - **Frontend UI Implementation (`frontend/settings-new.html`, `frontend/settings-new.js`):**
    - **Dedicated Ownership Section:** Separate "👑 Ownership Management" section in admin settings with crown icon branding
    - **Visual Owner Indicators:** Crown icons (👑) displayed next to owner username in user management lists
    - **Protected UI Elements:** Owner edit/delete buttons disabled with visual indicators and tooltips
    - **Transfer Confirmation Modal:** Secure ownership transfer interface requiring "TRANSFER" text confirmation
    - **Modern User Management:** Redesigned users list with professional styling, hover effects, and responsive design
    - **Action Button Enhancement:** Improved edit/delete buttons with smooth animations and theme compatibility
  - **Migration Safety:** Automatic owner assignment to first user during migration with comprehensive error handling
  - **Security Features:** Owner cannot be deleted, demoted, or have ownership transferred without explicit confirmation
  - _Files: `backend/migrations/031_add_owner_role.sql`, `backend/app.py`, `backend/auth_routes.py`, `backend/auth_utils.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_

- **Product Age Tracking and Sorting:** Enhanced warranty cards with product age display and sorting capabilities to help users track ownership duration.
  - **Age Calculation (`frontend/script.js`):** Added `calculateProductAge()` function that computes time elapsed since purchase date with intelligent formatting:
    - **Smart Display Format:** Shows age as "2 years, 3 months", "6 months", or "15 days" depending on duration
    - **Edge Case Handling:** Gracefully handles invalid dates, future dates, and same-day purchases ("Today")
    - **Precision Logic:** Shows days only for items less than a year old to avoid clutter
  - **Visual Integration:** Product age now appears on all warranty cards across all view types:
    - **Grid View:** Age displayed between purchase date and warranty duration for logical flow
    - **List View:** Consistent placement maintaining card layout harmony
    - **Table View:** Compact age display optimized for dense information presentation
  - **Age-Based Sorting:** Added "Age" option to Sort By dropdown with dedicated sorting logic:
    - **Oldest First:** Products sorted with longest-owned items appearing first
    - **Precise Sorting:** Uses `calculateProductAgeInDays()` helper function for accurate day-level sorting
    - **Invalid Date Handling:** Items with missing purchase dates treated as newest (0 days old)
  - **User Benefits:** Enables users to track ownership duration, assess product lifecycle, and organize warranties by how long they've owned each item
  - _Files: `frontend/index.html`, `frontend/script.js`_

  - **Persistent View Scope (Global/Personal) with Auto-Loading:** The app now remembers the user's last selected view scope (global or personal) and automatically loads the correct data from the appropriate API endpoint on page load, not just updating the UI.
  - **Seamless Experience:** Users no longer need to re-select their preferred view after a refresh; the correct data and UI are loaded immediately based on their last choice.
  - **Consistent State:** Both the main warranties page and the status dashboard respect the saved preference and fetch from the correct endpoint (`/api/warranties/global` or `/api/warranties`, and `/api/statistics/global` or `/api/statistics`).
  - **User-Specific Storage:** Preferences are stored per user/admin using the same prefix system as other settings.
  - **Robustness:** The system defaults to personal view if no preference is found or on error, and always keeps the UI and data in sync.
  - _Files: `frontend/script.js`, `frontend/status.js`_

- **Authentication System Refactoring to Flask Blueprints:** Complete restructuring of authentication routes for improved code organization and maintainability.
  - **Flask Blueprint Architecture:** Migrated all authentication routes from the monolithic `app.py` file to a dedicated Flask Blueprint (`auth_routes.py`)
  - **Modular Code Organization:** Separated authentication logic into specialized modules:
    - **`auth_utils.py`:** Authentication helper functions (`generate_token`, `decode_token`, `token_required`, `admin_required`, `is_valid_email`, `is_valid_password`)
    - **`auth_routes.py`:** Authentication Blueprint containing all auth-related routes and handlers
  - **Routes Migrated:** All authentication endpoints moved to Blueprint architecture:
    - User registration and login (`/register`, `/login`, `/logout`)
    - Token validation and user management (`/validate-token`, `/user`)
    - Password management (`/password/reset-request`, `/password/reset`, `/password/change`)
    - Profile and account management (`/profile`, `/account`, `/preferences`)
    - Email management (`/change-email`, `/verify-email-change`)
    - System status endpoints (`/registration-status`)
  - **Backward Compatibility:** All API endpoints maintain identical URLs and functionality - zero breaking changes for existing clients
  - **Import Optimization:** Reduced main application file size and improved code maintainability through separation of concerns
  - **Docker Integration:** Updated Dockerfile to properly include new authentication modules in container builds
  - _Files: `backend/auth_utils.py`, `backend/auth_routes.py`, `backend/app.py`, `Dockerfile`_

- **Smart Currency Default Selection:** Enhanced add warranty form to automatically default to user's preferred currency from settings instead of always defaulting to USD.
  - **Settings Integration:** Currency dropdown in add warranty modal now reads user's preferred currency from settings and auto-selects it as the default
  - **Currency Code Storage:** Settings page now saves both currency symbol and currency code to localStorage for accurate currency identification
  - **Intelligent Fallback:** System attempts to derive currency code from symbol if not explicitly saved, with USD as ultimate fallback
  - **Form Reset Handling:** Add warranty modal properly restores user's preferred currency after form reset operations
  - **Individual Override:** Users can still change currency for individual warranties while maintaining their preferred default
  - **Seamless Experience:** Eliminates need to manually change currency from USD to preferred currency for every new warranty
  - **Debug Logging:** Added comprehensive logging to track currency code detection and default selection process
  - _Files: `frontend/script.js`, `frontend/settings-new.js`_

### Enhanced
- **Larger Product Photo Thumbnails:** Increased photo thumbnail sizes across all view modes for better product visibility and identification.
  - **Grid View Enhancement:** Photo thumbnails increased from 60px × 60px to 80px × 80px for more prominent product images
  - **List View Enhancement:** Photo thumbnails increased from 50px × 50px to 70px × 70px for improved visual clarity
  - **Table View Enhancement:** Photo thumbnails increased from 40px × 40px to 55px × 55px for better readability in compact view
  - **Mobile Responsive Updates:** Adjusted mobile photo sizes to maintain usability while providing larger images on smaller screens
  - **Consistent Styling:** Maintained existing hover effects, border radius, and visual styling while increasing overall size
  - **Better User Experience:** Larger photos make it easier to identify products at a glance across all viewing modes
  - _Files: `frontend/style.css`, `frontend/script.js`_

### Fixed
- **CSV Import Currency Selection:** Fixed CSV import functionality that was incorrectly defaulting all imported warranties to USD currency instead of using the user's preferred currency from settings.
  - **Root Cause:** CSV import function in `backend/app.py` was hardcoding `'USD'` for all imported warranties regardless of user preferences
  - **Solution:** Enhanced import function to query user's preferred currency symbol from `user_preferences` table and convert it to appropriate currency code
  - **Currency Mapping:** Implemented comprehensive symbol-to-code mapping for 30+ currencies (€→EUR, £→GBP, ¥→JPY, etc.) matching frontend logic
  - **Intelligent Fallback:** Graceful fallback to USD for users without currency preferences or with unknown custom symbols
  - **Enhanced Logging:** Added detailed logging to track currency preference detection and assignment during import process
  - **Result:** Imported warranties now automatically use user's preferred currency (Euro, Pound, Yen, etc.) instead of always defaulting to USD
  - _Files: `backend/app.py`_

- **Export Function Debugging and Verification:** Resolved user reports of incomplete warranty exports by implementing comprehensive debugging tools and verifying export functionality
  - **Root Cause Analysis:** Determined that export function was working correctly - all warranties were being exported as expected
  - **Debug Implementation:** Added detailed console logging to export process showing step-by-step filter application and final export counts
  - **Verification Tools:** Created interactive debug page (`frontend/debug-export.html`) and backend debug API (`/api/debug/export`) for troubleshooting
  - **User Education:** Identified that perceived "missing" records were due to CSV viewer display issues with similar/duplicate entries rather than export functionality problems
  - **Export Validation:** Confirmed all warranties are properly included in CSV output with correct data formatting and structure
  - **Documentation:** Enhanced export process with real-time feedback showing actual number of warranties exported

- **Critical User Preferences Persistence Bug:** Fixed date format and currency symbol settings not saving properly, causing user preferences to revert to defaults after page refresh.
  - **Root Cause:** Backend API endpoints (`GET`/`PUT` `/api/auth/preferences`) were hardcoded to always return `currency_symbol: '$'` and `date_format: 'MDY'` instead of reading from/writing to the database columns
  - **Database Verification:** Confirmed both `currency_symbol` and `date_format` columns exist in `user_preferences` table via migrations `006_add_currency_symbol_column.py` and `019_add_date_format_column.sql`
  - **Backend API Fixes (`backend/auth_routes.py`):**
    - **GET Route:** Added `currency_symbol, date_format` to SELECT queries and updated response mapping to use actual database values
    - **PUT Route:** Added validation and processing for `currency_symbol` and `date_format` from request data
    - **UPDATE Query:** Enhanced to include currency symbol and date format in SET clauses
    - **INSERT Query:** Updated to save currency symbol and date format for new user preferences
    - **Response Consistency:** All preference responses now return actual saved values instead of hardcoded defaults
  - **Validation Added:** Currency symbol limited to 8 characters, date format restricted to valid options (`MDY`, `DMY`, `YMD`, `MDY_WORDS`, `DMY_WORDS`, `YMD_WORDS`)
  - **Result:** Settings page now properly persists currency symbol (€, £, ¥, etc.) and date format preferences across page refreshes and sessions
  - _Files: `backend/auth_routes.py`_

- **Critical OIDC Login RecursionError Fix:** Resolved fatal `RecursionError: maximum recursion depth exceeded` preventing OIDC authentication with self-hosted providers like Authentik.
  - **Root Cause:** Gunicorn's `gevent` worker type needs to monkey-patch standard libraries (like `ssl`) before they're imported, but `preload_app = True` was loading Flask dependencies before patching occurred
  - **Solution:** Enhanced `gunicorn_config.py` with conditional early monkey patching that occurs at the very beginning of the configuration file, before any other imports
  - **Intelligent Patching:** Monkey patching now only applies to memory modes that use gevent workers (`optimized` and `performance`), while `ultra-light` mode with sync workers skips patching entirely
  - **Safety:** Uses try/catch block to gracefully handle environments without gevent installed, ensuring no impact on sync workers or development environments
  - **Result:** OIDC providers now work correctly with gevent workers, eliminating SSL recursion errors and enabling SSO functionality across all deployment modes
  - **Verification:** MonkeyPatchWarning no longer appears in startup logs, replaced with "✅ Early gevent monkey patch applied for SSL compatibility" confirmation
  - _Files: `backend/gunicorn_config.py`_

- **Critical OIDC HTTPS Callback URL Fix:** Resolved OIDC login failures when Warracker is accessed over HTTPS, where the application was generating incorrect `http://` callback URLs instead of `https://` URLs.
  - **Root Cause:** Flask application running behind Nginx reverse proxy was not aware of the original HTTPS protocol, causing `url_for(_external=True)` to generate HTTP callback URLs that didn't match the OIDC provider's expected HTTPS URLs
  - **Reverse Proxy Configuration:** While Nginx correctly sent `X-Forwarded-Proto: https` headers, Gunicorn and Flask were not configured to trust and use these forwarded headers
  - **Gunicorn Fix (`backend/gunicorn_config.py`):** Added `forwarded_allow_ips = '*'` configuration to trust proxy headers from the containerized Nginx reverse proxy
  - **Flask Middleware (`backend/app.py`):** Implemented `ProxyFix` middleware with `x_for=1, x_proto=1, x_host=1, x_prefix=1` to read forwarded headers and update Flask's request context
  - **Header Processing:** Flask now correctly interprets `X-Forwarded-Proto` headers and generates HTTPS URLs when accessed through the reverse proxy
  - **Result:** OIDC login flow now generates correct `https://warracker.domain.com/api/oidc/callback` URLs, eliminating provider callback mismatches and enabling successful SSO authentication over HTTPS
  - **Standard Practice:** Implements industry-standard reverse proxy configuration for Flask applications behind SSL-terminating proxies
  - _Files: `backend/gunicorn_config.py`, `backend/app.py`_

- **Global vs. Individual Apprise Notification Mode:** Implemented flexible Apprise notification system allowing administrators to choose between consolidated global notifications or personalized individual notifications.
  - **Database Migration (`backend/migrations/032_add_apprise_notification_mode.sql`):** Added `apprise_notification_mode` setting to `site_settings` table with default value 'global' for backward compatibility
  - **Backend Notification Logic (`backend/notifications.py`):** Enhanced `send_expiration_notifications` function with mode-aware branching logic:
    - **Global Mode:** Sends single consolidated notification summarizing all expiring warranties across all users to configured Apprise channels
    - **Individual Mode:** Sends separate personalized notifications for each user with expiring warranties, grouped by user with targeted messaging
    - **Smart User Filtering:** Respects user notification preferences and timing eligibility for both manual and scheduled notifications
    - **Mode Detection:** Dynamically reads `apprise_notification_mode` setting from database using imported `get_site_setting` function
  - **Apprise Handler Enhancement (`backend/apprise_handler.py`):** Added two new specialized notification methods:
    - **`send_global_expiration_notification()`:** Creates summary notification with warranties grouped by user email for administrator overview
    - **`send_individual_expiration_notification()`:** Generates personalized notifications with user-specific greeting and warranty details
    - **Error Handling:** Comprehensive exception handling and logging for both notification modes
  - **Frontend Admin Controls (`frontend/settings-new.html`, `frontend/settings-new.js`):** 
    - **Notification Mode Dropdown:** Added selection between "Global Summary" and "Per User" modes in Apprise settings section
    - **Dynamic Description:** Real-time description updates explaining current mode behavior and implications
    - **Settings Integration:** Mode preference saved to backend and persisted across sessions with proper loading and validation
    - **Event Handling:** Immediate UI feedback when switching between notification modes
  - **Backward Compatibility:** Existing installations default to 'global' mode, maintaining current notification behavior without disruption
  - **Future Enhancement Ready:** Individual mode framework prepared for future per-user Apprise channel configuration
  - _Files: `backend/migrations/032_add_apprise_notification_mode.sql`, `backend/notifications.py`, `backend/apprise_handler.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_

  - **Apprise Warranty Scope Control:** Added administrator control to choose which warranties are included in Apprise notifications, enabling both multi-user and personal notification scenarios.
  - **Database Migration (`backend/migrations/033_add_apprise_warranty_scope.sql`):** Added `apprise_warranty_scope` setting to `site_settings` table with default value 'all' to maintain current behavior
  - **Backend Warranty Filtering (`backend/notifications.py`):** Implemented warranty scope filtering logic in notification processing:
    - **All Users Scope (Default):** Includes expiring warranties from all users in the system (current behavior)
    - **Admin Only Scope:** Filters to only include warranties belonging to the admin/owner user for personal notifications
    - **Smart Admin Detection:** Automatically identifies the primary admin by first checking for owner user, then falling back to first admin user
    - **Scope Logging:** Comprehensive logging shows original vs filtered warranty counts for transparency and debugging
  - **Frontend Warranty Scope Controls (`frontend/settings-new.html`, `frontend/settings-new.js`):**
    - **Warranty Scope Dropdown:** Added selection between "All Users' Warranties" and "Admin's Warranties Only" in Apprise settings
    - **Scope Description:** Real-time description updates explaining which warranties will be included in notifications
    - **Settings Persistence:** Warranty scope preference saved to backend and properly loaded with other Apprise settings
    - **Event Handling:** Immediate UI feedback when changing warranty scope selection
  - **Flexible Combinations:** Works seamlessly with notification modes for complete control:
    - **Global + All:** Single notification with all users' warranties (original behavior)
    - **Global + Admin:** Single notification with only admin's warranties
    - **Individual + All:** Separate notifications sent to each user with their warranties
    - **Individual + Admin:** Notification sent only to admin with their warranties
  - **Error Handling:** Graceful fallback to 'all' scope if admin user cannot be determined, with appropriate logging
  - _Files: `backend/migrations/033_add_apprise_warranty_scope.sql`, `backend/notifications.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_

- **Enhanced Notification Settings with Apprise Integration:** Comprehensive enhancement of user notification preferences to support both email and Apprise notifications with individual timing control.
  - **Backend User Preferences Enhancement (`backend/auth_routes.py`):** Fixed and expanded user preferences API to properly handle all notification fields:
    - **Notification Channel Support:** Added proper handling for `notification_channel` field allowing users to choose between 'none', 'email', 'apprise', or 'both'
    - **Apprise Timing Fields:** Added support for `apprise_notification_time`, `apprise_notification_frequency`, and `apprise_timezone` in user preferences
    - **Database Persistence:** Fixed critical bug where notification channel and Apprise settings were hardcoded instead of being saved to/loaded from database
    - **Validation:** Added proper validation for notification channel values and timing fields
    - **API Consistency:** Both GET and PUT `/api/auth/preferences` endpoints now properly handle all notification-related fields
  - **Frontend Notification Settings Redesign (`frontend/settings-new.html`, `frontend/settings-new.js`):**
    - **Dual Notification Sections:** Separated user notification preferences from admin Apprise configuration for clarity
    - **Dynamic Settings Display:** Notification settings section shows/hides email and Apprise fields based on selected notification channel
    - **Individual Timing Control:** Users can set separate notification times and timezones for email vs Apprise notifications
    - **Smart Field Management:** Apprise-specific fields (time, timezone, frequency) appear only when notification channel includes 'apprise' or 'both'
    - **Timezone Loading:** Proper timezone dropdown population for both email and Apprise notification settings
    - **Settings Persistence:** All notification preferences properly save to user preferences and persist across sessions
  - **Scheduler Integration:** Enhanced notification scheduler to respect individual user notification channel preferences:
    - **Channel-Aware Processing:** Scheduler checks each user's `notification_channel` setting to determine which notification types to send
    - **Separate Timing:** Users can receive email notifications at one time and Apprise notifications at a different time
    - **Preference Validation:** Only users with appropriate notification channels enabled receive corresponding notification types
  - **User Experience Improvements:**
    - **Clear Separation:** Admin Apprise configuration (URLs, global settings) separated from user notification preferences (timing, channels)
    - **Intuitive Interface:** Notification channel dropdown with immediate visual feedback showing relevant settings
    - **Flexible Scheduling:** Users can choose to receive only emails, only Apprise notifications, or both at different times
  - _Files: `backend/auth_routes.py`, `frontend/settings-new.html`, `frontend/settings-new.js`_

- **Apprise Notification Message Format Standardization:** Unified notification message format between scheduled and manual Apprise notifications for consistency.
  - **Message Format Alignment (`backend/apprise_handler.py`):** Updated scheduled notification functions to match manual test notification format:
    - **Consistent Titles:** All notifications now use format `"[Warracker] Warranties Expiring in X Days"` instead of generic summary titles
    - **Urgency Indicators:** Added emoji prefixes based on expiration timeframe:
      - 🚨 URGENT: for warranties expiring in 1 day
      - ⚠️ IMPORTANT: for warranties expiring in ≤7 days  
      - 📅 REMINDER: for warranties expiring in >7 days
    - **Grouped by Days:** Separate notifications sent for different expiration timeframes (7, 30, 365 days) instead of combined summary
    - **Standardized Content:** Consistent bullet-point format, date formatting, and footer text across all notification types
  - **Enhanced Notification Functions:**
    - **`send_global_expiration_notification()`:** Now groups warranties by expiration days and sends separate notifications for each timeframe
    - **`send_individual_expiration_notification()`:** Similarly updated to match manual test format with proper grouping
    - **`_send_global_expiration_batch()` and `_send_individual_expiration_batch()`:** New helper functions that use identical formatting to manual test notifications
  - **User Benefits:** 
    - **Consistent Experience:** Manual test notifications and scheduled notifications now look identical
    - **Clear Urgency:** Emoji indicators immediately convey urgency level
    - **Better Organization:** Separate notifications for different timeframes instead of overwhelming combined messages
  - _Files: `backend/apprise_handler.py`_

- **Apprise Settings UI Cleanup:** Streamlined Apprise configuration interface by removing non-functional decorative fields.
  - **Removed Decorative Fields (`frontend/settings-new.html`, `frontend/settings-new.js`):** Eliminated unused time and timezone fields from admin Apprise configuration:
    - **Notification Time Field:** Removed time input that was not used by the notification scheduler
    - **Timezone Dropdown:** Removed timezone selection that was not used by the notification scheduler  
    - **Notification Frequency:** Renamed to "Check Frequency" with clearer description as a global system setting
  - **JavaScript Cleanup:** Removed all references to unused fields including variable definitions, event listeners, and data loading functions
  - **Status Display Cleanup:** Removed "Notification Time" from current status display since it's no longer relevant
  - **Cache-Busting:** Updated version parameters from `v=20250529005` to `v=20250529006` to force browser cache refresh
  - **Functional Clarity:** Apprise card now only contains settings that actually affect system behavior:
    - ✅ Enable/Disable toggle, Notification Mode, Warranty Scope, Notification URLs, Notification Days, Check Frequency, Message Title Prefix
    - ❌ Removed: Notification Time, Timezone (these are now properly handled in user notification preferences)
  - **User Experience:** Clear separation between admin system configuration and user personal notification timing preferences
  - _Files: `frontend/settings-new.html`, `frontend/settings-new.js`_

### Code Quality & Maintenance
- **Legacy OIDC Code Cleanup:** Removed ~290 lines of commented-out and orphaned OIDC code from main application file for improved maintainability.
  - **Removed Components:**
    - **Commented Route Definitions:** Eliminated ~150 lines of commented-out `/api/oidc/login` and `/api/oidc/callback` route definitions
    - **Orphaned Callback Logic:** Removed ~140 lines of disconnected OIDC callback handling code including user provisioning, token handling, and error redirection logic
    - **Dead Code Elimination:** Cleaned up legacy authentication code that was replaced by the Blueprint architecture
  - **OIDC Functionality Preserved:** All OIDC functionality remains fully operational through the proper Blueprint architecture in `backend/oidc_handler.py`
  - **File Size Reduction:** Reduced `backend/app.py` from ~3,477 lines to ~3,200 lines (~8% reduction)
  - **Code Organization:** Improved code readability and maintainability by removing confusing commented-out legacy implementations
  - **Blueprint Verification:** Confirmed `oidc_bp` Blueprint is properly registered and functional at `/api/oidc/*` endpoints
  - _Files: `backend/app.py`_

##  0.10.1.0 - 2025-06-10

### Added
- **Public Global Warranty View for All Users**
  - Extended global warranty view access to all authenticated users (previously admin-only)
  - **Regular Users**: Can view all warranties from all users but can only edit/delete their own
  - **Admin Users**: Can edit/delete any warranty in global view, maintaining full administrative control
  - Added read-only protection: edit/delete buttons are replaced with view-only eye icon for warranties not owned by current user (unless user is admin)
  - Updated UI labels and tooltips to reflect the new public access model
  - Maintains full admin functionality while providing transparency to all users

- **Admin Global View Control Settings**
  - Added admin setting to enable/disable the global view feature site-wide
  - New "Global View Enabled" toggle in Site Settings section of admin panel
  - New "Global View Admin Only" toggle to restrict global view access to administrators only
  - When disabled, global view switcher is hidden from all users (including non-admins)
  - When admin-only is enabled, only administrators can access global view feature
  - Real-time enforcement: users automatically redirected to personal view if global view is disabled or restricted while they're using it
  - Default enabled for backward compatibility with admin-only setting defaulted to false

- **Global View for Status Dashboard**
  - Extended global view functionality to the warranty status/analytics page
  - Eligible users can now view warranty statistics and data from all users on the status dashboard
  - Added view switcher (Personal/Global) to status page header with same permission controls as main page
  - Global statistics include total counts, charts, and warranty tables from all users
  - Owner information displayed in warranty tables when in global view mode
  - Maintains same security model: admins can see all data, regular users see all data but with read-only access to others' warranties
  - Seamless integration with existing global view settings and permissions
- **Apprise Push Notifications Integration:** Comprehensive push notification system supporting 80+ services for warranty expiration alerts.
  - **Backend Implementation:**
    - **Apprise Handler (`backend/apprise_handler.py`):** Complete notification management system with configuration loading, URL validation, and multi-service support.
    - **Database Migration (`backend/migrations/026_add_apprise_settings.sql`):** Added Apprise configuration settings to site_settings table.
    - **API Endpoints (`backend/app.py`):** Full REST API for Apprise management including test notifications, URL validation, configuration reload, and manual triggers.
    - **Scheduler Integration:** Enhanced existing notification scheduler to send both email and Apprise notifications simultaneously.
    - **Environment Support:** Full environment variable support for Docker deployments with fallback to database configuration.
  - **Frontend Implementation:**
    - **Admin Settings UI (`frontend/settings-new.html`):** Complete Apprise configuration section with real-time status, URL management, and testing capabilities.
    - **JavaScript Integration (`frontend/settings-new.js`):** Full frontend functionality for configuration management, URL validation, and notification testing.
    - **Responsive Design (`frontend/settings-styles.css`):** Modern UI components including status badges, action grids, and mobile-responsive layouts.
  - **Supported Services:** Discord, Slack, Telegram, Email (Gmail, Outlook), Microsoft Teams, Webhooks, Matrix, Pushover, Ntfy, Gotify, and 70+ more services.
  - **Configuration Options:**
    - **Multiple Notification URLs:** Support for comma-separated or line-separated notification service URLs
    - **Flexible Timing:** Configurable notification days (e.g., 7,30 days before expiration) and daily notification time
    - **Custom Branding:** Configurable title prefix for all notifications (e.g., "[Warracker]")
    - **Test Functionality:** Send test notifications to verify configuration before enabling
    - **URL Validation:** Real-time validation of Apprise notification URLs
  - **Environment Configuration (`env.example`):** Complete example configuration file with detailed Apprise setup instructions and URL format examples.
  - **Graceful Degradation:** System continues to function normally if Apprise is not installed, with appropriate admin notifications.
  - _Files: `backend/apprise_handler.py`, `backend/migrations/026_add_apprise_settings.sql`, `backend/app.py`, `backend/db_handler.py`, `backend/requirements.txt`, `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/settings-styles.css`, `docker-compose.yml`, `env.example`_
- **Warranty Type Filtering and Sorting:** Enhanced the home page with comprehensive warranty type filtering and sorting capabilities.
  - **New Warranty Type Filter Dropdown:** Added a dedicated "Warranty Type" filter dropdown in the filter section, positioned between Vendor and Sort By filters.
  - **Dynamic Filter Population:** The warranty type filter automatically populates with all unique warranty types found in existing warranties, sorted alphabetically.
  - **Case-Insensitive Filtering:** Warranty type filtering works regardless of the case of the warranty type (e.g., "Standard", "standard", "STANDARD").
  - **Sorting by Warranty Type:** Added "Warranty Type" as a sorting option in the Sort By dropdown, allowing users to sort warranties alphabetically by their warranty type.
  - **Real-time Filtering:** Filter applies immediately when warranty type selection changes, working seamlessly with existing filters (Status, Tag, Vendor, Search).
  - **Frontend Implementation:**
    - Updated `frontend/index.html` to include warranty type filter dropdown and sort option
    - Enhanced `frontend/script.js` with warranty type filtering logic, event listeners, and population function
    - Added `populateWarrantyTypeFilter()` function to dynamically populate filter options from warranty data
    - Integrated warranty type support into `currentFilters` object and `applyFilters()` function
    - Added warranty type sorting logic to `renderWarranties()` function
  - **Integration:** Works with the existing warranty type field that was previously added to add/edit forms, providing end-to-end warranty type management.
  - _Files: `frontend/index.html`, `frontend/script.js`_

- **Admin Global Warranty View:** Added a globe button for administrators to view all users' warranties alongside their own.
  - **Backend API (`backend/app.py`):** New `/api/admin/warranties` endpoint that returns all warranties from all users with user information (username, email, display name).
  - **Frontend UI (`frontend/index.html`):** Added admin-only "Scope" toggle with Personal/Global view buttons next to the existing view switcher.
  - **Frontend Logic (`frontend/script.js`):** 
    - Added `isGlobalView` state management and view switching functions
    - Enhanced warranty rendering to show owner information when in global view
    - Automatic admin detection and UI initialization
    - Dynamic title updates ("Your Warranties" vs "All Users' Warranties")
  - **Styling (`frontend/style.css`):** 
    - Admin view switcher styling with primary color theme
    - Owner information highlighting with colored border and background
    - Responsive design for mobile devices
  - **Security:** Admin-only access with proper permission checks and graceful fallbacks for non-admin users.
  - _Files: `backend/app.py`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

- **Product Photo Thumbnails on Warranty Cards:** Enhanced warranty cards with visual product photo thumbnails for quick identification and easy access to full-size images.
  - **Thumbnail Display:** Product photos now appear as small thumbnails in the top right corner of each warranty card, providing instant visual recognition of products.
  - **Multi-View Support:** Photo thumbnails are displayed across all warranty viewing modes:
    - **Grid View:** 60px thumbnails positioned elegantly in the card corner
    - **List View:** 50px thumbnails for compact horizontal layouts
    - **Table View:** 40px thumbnails optimized for dense data display
  - **Interactive Photo Access:** Users can click on any product photo thumbnail to open the full-size image in a new browser tab for detailed viewing.
  - **Secure Image Handling:** Product photos are served through secure authentication, ensuring only authorized users can view warranty images while maintaining fast loading performance.
  - **Real-time Updates:** When users add or update product photos through the warranty edit forms, the thumbnail images immediately appear on warranty cards without requiring a page refresh.
  - **Visual Feedback:** Photo thumbnails include hover effects and "Click to view full size image" tooltips to clearly indicate their interactive nature.
  - **Responsive Design:** Photo thumbnails automatically scale and position appropriately across different screen sizes and device types.
  - _Files: `frontend/script.js`, `frontend/style.css`_

### Fixed
- **Status Dashboard Chart.js Canvas Errors**
  - Fixed "Canvas is already in use" errors on the status page that prevented charts from rendering properly
  - **Chart Destruction**: Added proper chart destruction with error handling before creating new charts
  - **Multiple Initialization Prevention**: Added initialization flags to prevent multiple dashboard initializations
  - **DOM Event Protection**: Protected against duplicate DOM event handler attachments
  - **Improved Error Handling**: Added try-catch blocks around chart creation and destruction operations
  - **View Switching Stability**: Fixed chart recreation issues when switching between personal and global views
  - **Result**: Status page charts now render reliably without canvas conflicts, multiple view switches work smoothly
  - _Files: `frontend/status.js`_

- **CSS Cache Busting for Domain Consistency**
  - Added version parameters to CSS and JavaScript files across all major pages to prevent caching issues between local IP and domain access
  - **CSS Files Updated:** `style.css?v=20250529005`, `header-fix.css?v=20250529005`, `mobile-header.css?v=20250529005`, `settings-styles.css?v=20250529005`
  - **JavaScript Files Updated:** `script.js?v=20250529005`, `auth.js?v=20250529005`, `settings-new.js?v=20250529005`
  - Updated Service Worker cache name to `warracker-cache-v2` and included all versioned files to force cache refresh
  - Fixed styling inconsistencies where admin global warranty view and other features appeared differently between local IP and domain access
  - Ensures all users get consistent styling and functionality across all pages including index, settings, and status pages
  - _Files: `frontend/index.html`, `frontend/settings-new.html`, `frontend/status.html`, `frontend/script.js`, `frontend/sw.js`_
- **Settings Page Admin Permission Issues:** Fixed critical database connection errors and 403 permission issues preventing regular users from accessing the settings page.
  - **Backend Database Connection (`backend/app.py`):** Fixed inconsistent cursor variable usage in `delete_account()` function that was causing 500 errors when users attempted to delete their accounts (was using both `cursor` and `cur` variables inconsistently).
  - **Frontend Admin Permission Checks (`frontend/settings-new.js`):** Added comprehensive admin permission checks to prevent non-admin users from triggering 403 errors:
    - **Initial Load Protection:** Wrapped admin-only settings calls (`loadSiteSettings()`, `loadAppriseSettings()`, `loadAppriseSiteSettings()`) with user admin status checks during page initialization.
    - **Deferred Load Protection:** Added admin checks for delayed Apprise settings loading to prevent unauthorized API calls.
    - **Graceful 403 Handling:** Enhanced `loadSiteSettings()` function with proper 403 response handling that hides admin sections instead of showing error messages.
  - **Improved Error Messaging:** Fixed misleading "Account cannot be deleted in offline mode" error by removing problematic nested try-catch that was masking actual API error messages. Users now see specific backend error messages instead of generic offline warnings.
  - **Root Cause:** Settings page was unconditionally calling admin-only API endpoints for all users, causing 403 errors and confusing error messages for regular users.
  - **Result:** Regular users can now access settings page without errors, see only relevant settings sections, and get clear error messages when actual issues occur. Admin users continue to see all settings sections as expected.
  - _Files: `backend/app.py`, `frontend/settings-new.js`_

- **Settings Persistence Critical Fixes:** Resolved major settings page persistence issues where user preferences would appear to save but revert to defaults when navigating away and returning.
  - **Backend Settings UPDATE Logic (`backend/app.py`):** Fixed critical bug in `/api/auth/preferences` endpoint where Apprise notification settings weren't being properly saved to the database:
    - **Column Detection Fix:** Changed condition from `if apprise_notification_time and has_apprise_notification_time_col:` to `if apprise_notification_time is not None and has_apprise_notification_time_col:` to handle empty string values properly
    - **Complete Field Mapping:** Added missing Apprise fields (`notification_channel`, `apprise_notification_time`, `apprise_notification_frequency`, `apprise_timezone`) to SELECT query return fields
    - **Preference Response Mapping:** Enhanced preference mapping to include all Apprise settings in API responses
  - **Frontend Race Condition Fixes (`frontend/settings-new.js`):** Eliminated multiple simultaneous API calls that were causing preference loading conflicts:
    - **Duplicate Request Prevention:** Fixed `loadPreferences()` being called 4 times simultaneously, causing race conditions
    - **API Priority Logic:** Ensured API data takes precedence over localStorage when both exist
    - **UI Synchronization:** Added proper dark mode toggle sync between API and UI state
    - **Authentication Token Standardization:** Unified token usage pattern across all preference save functions
  - **Root Cause:** Backend was silently failing to save Apprise settings due to strict conditional logic, while frontend race conditions were creating inconsistent data states
  - **Result:** Settings now persist correctly across page navigations, with all notification preferences saving and loading reliably
  - _Files: `backend/app.py`, `frontend/settings-new.js`_

- **Notification System Comprehensive Overhaul:** Fixed critical timing and duplicate notification issues affecting both email and Apprise scheduled notifications.
  - **Timing Logic Precision (`backend/notifications.py`):** Completely rewrote notification timing calculation for accurate delivery:
    - **Precise Windows:** Changed from aggressive "send_window or next_miss_window" logic to exact "0 <= time_diff <= 2" minute windows
    - **Post-Target Delivery:** Notifications now only send AFTER target time (not before) within 2-minute window to prevent early delivery
    - **Enhanced Time Calculations:** Added comprehensive timezone handling with detailed debug logging showing exact time differences
  - **Duplicate Prevention System (`backend/notifications.py`):** Implemented robust duplicate prevention using in-memory tracking:
    - **Separate Tracking:** Independent tracking for `email_{user_id}_{date}` and `apprise_{user_id}_{date}` patterns
    - **Daily Reset Logic:** Automatic cleanup for day rollover handling across different timezones
    - **Collision Prevention:** Added 0.1s delay for manual triggers to prevent collision with scheduled jobs
  - **Column Mismatch Fixes (`backend/notifications.py`):** Fixed database errors causing notification failures:
    - **Error Handling:** Added try/catch around column unpacking at line 327 to handle schema mismatches
    - **Variable Consistency:** Fixed missing `apprise_timezone` variable in debug logging sections
    - **Graceful Degradation:** System continues operating even with partial database schema issues
  - **Enhanced Debug Output (`backend/notifications.py`):** Added comprehensive logging for troubleshooting:
    - **Time Difference Display:** Shows exact calculations like "email_time=08:20(diff:-61), apprise_time=23:28(diff:-976)"
    - **Eligibility Reasons:** Clear logging explaining why users are/aren't eligible for notifications
    - **Real-time Diagnostics:** Live timing calculations visible in Docker logs for debugging
  - **Root Cause:** Overly aggressive timing windows caused duplicate emails, while backend save issues prevented Apprise settings from persisting, leading to notifications not being scheduled
  - **Result:** Both email and Apprise notifications now work reliably with precise timing, no duplicates, and proper settings persistence
  - _Files: `backend/notifications.py`, `backend/app.py`_



#### Technical Implementation for Global View Features
- **Backend (app.py):** 
  - Added new `/api/warranties/global` endpoint accessible to all authenticated users (not just admins)
  - Added `global_view_enabled` setting to site settings with default value 'true'
  - Added `global_view_admin_only` setting to site settings with default value 'false'
  - Added `/api/settings/global-view-status` endpoint for checking global view availability per user
  - Enhanced `/api/warranties/global` endpoint to check both global view settings and user admin status
  - Added new `/api/statistics/global` endpoint for global warranty statistics with user information
- **Frontend (script.js):** 
  - Renamed `initAdminViewControls()` to `initViewControls()` and removed admin-only restrictions
  - Updated `switchToGlobalView()` to check global view setting before switching
  - Added ownership and admin validation logic to conditionally render edit/delete buttons vs view-only placeholder
  - Admins see edit/delete buttons for all warranties, regular users only for their own
  - Modified API endpoint from `/api/admin/warranties` to `/api/warranties/global` for public access
  - Added real-time global view status checking and automatic fallback to personal view
- **Frontend (index.html):** Updated tooltips and labels to reflect public access
- **Frontend (style.css):** Added styling for view-only placeholder button with eye icon
- **Frontend (settings-new.html):** Added Global View Enabled and Global View Admin Only toggles in Site Settings section
- **Frontend (settings-new.js):** Added loading and saving logic for both global view settings
- **Frontend (status.html):** Added view switcher controls and owner column to warranty table for global view
- **Frontend (status.js):** Added global view functionality with API switching, table column management, and permission checking

#### Security Features
- Backend endpoint still requires authentication (all users must be logged in)
- Frontend validates warranty ownership and admin status before showing edit/delete buttons
- **Regular users** can only modify warranties they own, even in global view
- **Admin users** can modify any warranty in global view, maintaining administrative privileges
- Maintains data privacy while providing transparency

#### User Experience
- Seamless view switching between personal and global views for all users
- Clear visual indication (eye icon) when viewing others' warranties
- Consistent UI patterns with existing admin functionality
- Enhanced tooltips explaining read-only access for non-owned warranties

### Enhanced  
- **Footer Links:** Updated all "Powered by Warracker" footer links across the application to point to `https://warracker.com` instead of the GitHub repository, providing users with direct access to the official website.
  - **Files Updated:** `index.html`, `login.html`, `register.html`, `reset-password.html`, `reset-password-request.html`, `settings-new.html`, `status.html`, `auth-redirect.html`, and `about.html`
  - **Result:** Consistent branding and improved user experience with direct access to the official Warracker website.

- **PostgreSQL Security Hardening:** Removed unnecessary SUPERUSER privileges from the application database user, significantly improving security posture.
  - **Security Improvement:** Eliminated SUPERUSER grants that provided excessive and unnecessary privileges to the application database user
  - **Files Modified:** 
    - `backend/fix_permissions.sql`: Removed `ALTER ROLE %(db_user)s WITH SUPERUSER;` 
    - `backend/migrations/011_ensure_admin_permissions.sql`: Commented out SUPERUSER grant
    - `Dockerfile`: Removed retry loop attempting to grant SUPERUSER privileges via psql
  - **Principle of Least Privilege:** Application now operates with only the specific database privileges required for normal operation (CREATE/DROP/ALTER on tables, sequences, functions, etc.)
  - **Testing Verified:** Full application functionality confirmed to work correctly without SUPERUSER privileges, including migrations, user management, and all admin operations
  - **Security Benefit:** Significantly reduces attack surface - if the application is compromised, an attacker no longer has complete database administrative control
  - **Result:** Maintained full application functionality while eliminating unnecessary security risks

##  0.10.0.0 - 2025-06-4

### Fixed
- **View Preference Persistence Issue:** Fixed user view preferences (Grid, List, Table) not consistently persisting across logins.
  - **Backend (`backend/app.py`):** Modified `/api/auth/login` endpoint to include `is_admin` flag in the returned user object, ensuring proper view preference key prefix calculation immediately after login.
  - **Frontend (`frontend/script.js`):** 
    - Enhanced `switchView()` function with `saveToApi` parameter to control when view preferences are saved to the API, preventing unintended overwrites during initialization.
    - Modified `loadViewPreference()` to call `switchView` with `saveToApi = false` to prevent overwriting user's actual preferences with defaults.
    - Updated storage event listener for cross-tab synchronization to prevent redundant API saves when syncing view preferences between browser tabs.
  - **Root Cause:** Missing `is_admin` flag caused incorrect localStorage prefix usage and race conditions where preferences were saved with wrong prefix then not found when correct prefix was established.
  - **Result:** View preferences now properly persist across logins and synchronize between browser tabs for both admin and regular users.
- **Password Management Issues:** Fixed critical password change and reset functionality problems.
  - **Missing Password Change Endpoint (`backend/app.py`):** Implemented `/api/auth/password/change` endpoint to allow logged-in users to change their passwords through the Settings page. The endpoint validates current password, checks new password strength, and securely updates the user's password hash.
  - **Frontend Error Handling (`frontend/settings-new.js`):** Fixed misleading "Password cannot be changed in offline mode" error by removing nested try-catch block that was masking real API error messages. Now properly displays specific backend error messages.
  - **Password Reset Link Issue (`frontend/reset-password.html`):** Fixed "Invalid or Expired Link" error by removing premature token verification that was calling a non-existent `/api/auth/password/verify-token` endpoint. Token validity is now properly checked only during form submission.
  - **Root Cause:** Backend endpoint was missing entirely, frontend had incorrect error handling, and reset page was making unnecessary token verification calls.
  - **Result:** Users can now successfully change passwords while logged in and use password reset links without encountering false error messages.
- **SMTP Port 587 (STARTTLS) Functionality:** Enhanced email sending to support both port 465 (SMTPS/SSL) and port 587 (STARTTLS) configurations.
  - **Enhanced SMTP Connection Logic (`backend/app.py`):** Updated `send_password_reset_email()`, `send_expiration_notifications()`, and `send_email_change_verification_email()` functions with robust port-based SMTP logic.
    - **Port 465:** Uses `smtplib.SMTP_SSL()` for direct SSL connection
    - **Port 587:** Uses `smtplib.SMTP()` followed by `starttls()` for STARTTLS encryption  
    - **Other Ports:** Respects `SMTP_USE_TLS` environment variable for explicit STARTTLS control
  - **Environment Variable Support:** Added intelligent defaults where `SMTP_USE_TLS` defaults to true for port 587 unless explicitly set to false, ensuring proper STARTTLS behavior.
  - **Root Cause:** Previous logic used restrictive hostname-based conditions (`if smtp_host != 'localhost'`) instead of proper port-based SMTP configuration, causing STARTTLS failures with external SMTP servers on port 587.
  - **Result:** Email sending now works reliably with both common SMTP configurations, supporting major email providers like Gmail, Office 365, and other services using port 587.
- **Header Appearance Standardization (`frontend/reset-password-request.html`, `frontend/reset-password.html`):** Standardized headers to match consistent appearance across all pages.
  - **Missing CSS Includes:** Added `header-fix.css` and `fix-auth-buttons-loader.js` to ensure consistent header styling and behavior.
  - **Clickable Title:** Made "Warracker" title a clickable link to `index.html` for consistent navigation, matching other auth pages like `login.html` and `register.html`.
  - **Registration Status Script:** Added `registration-status.js` for consistent functionality across auth pages.
  - **Root Cause:** Pages were missing key CSS files and scripts that ensure header consistency, and the title was not a link unlike other pages.
  - **Result:** Headers now have identical appearance, dimensions, and responsive behavior as other application pages, providing consistent user experience.
### Enhanced  
- **Footer Links:** Updated all "Powered by Warracker" footer links across the application to point to `https://warracker.com` instead of the GitHub repository, providing users with direct access to the official website.
  - **Files Updated:** `index.html`, `login.html`, `register.html`, `reset-password.html`, `reset-password-request.html`, `settings-new.html`, `status.html`, `auth-redirect.html`, and `about.html`
  - **Result:** Consistent branding and improved user experience with direct access to the official Warracker website.

## 0.9.9.9 - 2025-06-01

### Added
- **OIDC SSO (Single Sign-On) Integration:**
  - Implemented OpenID Connect (OIDC) authentication flow using Authlib, allowing users to log in via external OIDC providers (e.g., Google, Keycloak).
  - **Backend (`app.py`):**
    - OIDC client configuration (Client ID, Secret, Issuer URL, Scope, Provider Name) is dynamically loaded from the `site_settings` database table at application startup.
    - OIDC feature can be enabled/disabled globally via the `oidc_enabled` setting in the database.
    - Added OIDC-specific routes: `/api/oidc/login` (initiates login) and `/api/oidc/callback` (handles redirect from IdP).
    - User provisioning: If an OIDC user doesn't exist locally, a new user account is created. Existing OIDC users are logged in.
    - Updated Admin Settings API (`/api/admin/settings`) to manage these OIDC parameters.
    - Database migration `023_add_oidc_columns_to_users.sql` adds `oidc_sub`, `oidc_issuer` to `users` table and `login_method` to `user_sessions` table for linking local users to OIDC identities.
  - **Frontend:**
    - **Login Page (`login.html`, `auth.js`):** Added an "Login with SSO Provider" button that initiates the OIDC flow.
    - **Admin Settings Page (`settings-new.html`, `settings-new.js`):** New "OIDC SSO Configuration" section for admins to enable/disable OIDC and configure provider details.
    - **Auth Redirect Page (`auth-redirect.html`):** Handles the token received from the `/api/oidc/callback` and logs the user in.
  - **Dependencies (`requirements.txt`):** Added `Authlib` and `requests`.
  - _Files: `backend/app.py`, `backend/migrations/023_add_oidc_columns_to_users.sql`, `backend/requirements.txt`, `frontend/login.html`, `frontend/auth.js`, `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/auth-redirect.html`_
- **SSO Registration Control:** When the site's registration setting is disabled, new users cannot register via SSO. Only existing users who already have accounts can use SSO to log in. This provides administrators with granular control over user registration while maintaining SSO functionality for existing users.
  - **Backend:** Enhanced OIDC callback handler to check the `registration_enabled` site setting before creating new user accounts via SSO.
  - **Frontend:** Added appropriate error message for users when SSO registration is blocked due to disabled registrations.
  - First user registration via SSO is still allowed regardless of the setting (same as regular registration).
  - _Files: `backend/oidc_handler.py`, `frontend/auth-redirect.html`_
- **Provider-Specific SSO Button Branding:** Enhanced the SSO login button to show provider-specific branding and icons for well-known OIDC providers.
  - **Supported Providers:** Google, GitHub, Microsoft/Azure, Facebook, Twitter, LinkedIn, Apple, Discord, GitLab, Bitbucket, Keycloak, and Okta.
  - **Dynamic Button Text:** Shows "Login with Google", "Login with GitHub", etc., based on the configured `OIDC_PROVIDER_NAME`.
  - **Provider Icons:** Uses appropriate Font Awesome icons for each provider (e.g., Google logo for Google, GitHub logo for GitHub).
  - **Brand Colors:** Each provider button uses authentic brand colors with proper hover effects.
  - **Fallback Support:** Unknown providers display the generic "Login with SSO Provider" button with default styling.
  - **Environment Integration:** Works automatically with the `OIDC_PROVIDER_NAME` environment variable and database settings.
  - _Files: `frontend/login.html`, `backend/oidc_handler.py`_
- **Exact Expiration Date Input:** Enhanced warranty entry to support exact expiration dates as an alternative to duration-based input.
  - **New Warranty Input Method:** Users can now choose between "Warranty Duration" (years/months/days) and "Exact Expiration Date" options when adding or editing warranties.
  - **UI Enhancements:** Added radio button selection for warranty entry method with smooth form field transitions and validation.
  - **Backend Support:** Both `add_warranty` and `update_warranty` API endpoints now handle `exact_expiration_date` parameter alongside duration fields.
  - **Smart Duration Display:** Warranty cards automatically calculate and display duration text even when using exact expiration dates, eliminating "N/A" values.
  - **Form Validation:** Enhanced validation ensures either exact date or duration is provided for non-lifetime warranties, with appropriate error messages.
  - **Date Calculation:** Added robust date calculation helper function that properly handles different month lengths, leap years, and edge cases.
  - _Files: `frontend/index.html`, `frontend/script.js`, `frontend/style.css`, `backend/app.py`_
- **Complete Field Updates:** All warranty fields (product info, dates, serial numbers, tags, documents) update immediately in the interface.
  - **Fallback Safety:** Maintains fallback to server reload if local update fails, ensuring data consistency.
  - _Files: `frontend/script.js`_
- **Memory Usage Optimization:** Significantly reduced RAM consumption for better performance on resource-constrained servers.
  - **Dynamic Memory Modes:** Configurable via `WARRACKER_MEMORY_MODE` environment variable with "optimized" (default), "ultra-light", and "performance" options.
  - **Optimized Mode:** 2 gevent workers with 128MB memory limits (~60-80MB total RAM usage).
  - **Ultra-Light Mode:** 1 sync worker with 64MB memory limit (~40-50MB total RAM usage for minimal servers).
  - **Performance Mode:** 4 gevent workers with 256MB memory limits (~150-200MB total RAM usage for high-performance servers).
  - **Worker Configuration:** Added memory limits per worker, connection pooling optimization, and preload_app for memory sharing.
  - **Database Pool:** Optimized connection pool from 10 to 4 maximum connections with memory-conscious settings.
  - **Flask Configuration:** Added memory-efficient settings including disabled JSON sorting, optimized session handling, and file serving optimizations.
  - **Dependency Addition:** Added gevent for more efficient async request handling compared to sync workers.
  - **Expected Reduction:** RAM usage configurable from ~40MB (ultra-light) to ~200MB (performance) based on server specifications.
  - _Files: `backend/gunicorn_config.py`, `backend/requirements.txt`, `backend/app.py`, `backend/db_handler.py`, `docker-compose.yml`_

### Changed
- **Environment Variables for OIDC (Docker):** While OIDC configuration is primarily managed via the database through the admin UI, the `docker-compose.yml` can include placeholder environment variables for initial setup or documentation:
  - `OIDC_ENABLED` (e.g., `true` or `false`)
  - `OIDC_PROVIDER_NAME` (e.g., `google`, `keycloak`)
  - `OIDC_CLIENT_ID`
  - `OIDC_CLIENT_SECRET`
  - `OIDC_ISSUER_URL`
  - `OIDC_SCOPE` (e.g., `openid email profile`)
- **`FRONTEND_URL` Environment Variable:** Emphasized the importance of correctly setting the `FRONTEND_URL` environment variable for the backend service in `docker-compose.yml` to ensure correct OIDC callback redirects.
  - _Files: `docker-compose.yml`, `Docker/docker-compose.yml`_

### Fixed
- Resolved various startup and runtime errors related to OIDC client initialization in a multi-worker (Gunicorn) environment, particularly concerning database connection pool stability and consistent loading of OIDC settings.
- Corrected OIDC metadata fetching by ensuring the proper Issuer URL is used (e.g., `https://accounts.google.com` for Google).
- Resolved `TypeError: Cannot read properties of null (reading 'classList')` during logout on `about.html` by ensuring the `loadingContainer` element is present and accessible to `script.js`'s `showLoading()` function. Modified `showLoading()` and `hideLoading()` to dynamically find the container if not initially available.
- Fixed `SyntaxError: Identifier 'AuthManager' has already been declared` on `about.html` by removing a duplicate import of `auth.js` from the `<head>`, ensuring it is loaded only once at the end of the `<body>`.
- Standardized the user menu dropdown button ID to `userMenuBtn` across `index.html`, `status.html`, and `about.html`. Consolidated user menu JavaScript logic into `auth.js`, removing redundant code from `settings-new.js` and `fix-auth-buttons.js` to ensure consistent dropdown behavior.
  - _Files: `backend/app.py`, `frontend/about.html`, `frontend/script.js`, `frontend/index.html`, `frontend/status.html`, `frontend/auth.js`, `frontend/settings-new.js`, `frontend/fix-auth-buttons.js`_
- **SSO Warranty Display Issue:** Fixed a critical timing problem where SSO users would see a blank warranty list after login. The issue was caused by a race condition where user preferences were loaded before user authentication was fully established.
  - Enhanced `auth-redirect.html` to fetch and store user information immediately after SSO login, ensuring `user_info` is available when the main application loads.
  - Fixed preference key prefix calculation to prevent mismatched user preference keys for SSO users.
  - _Files: `frontend/auth-redirect.html`, `frontend/auth.js`, `frontend/script.js`_
- **SSO Tag Creation Issue:** Resolved an issue where SSO users could not create new tags due to authentication token handling problems.
  - Updated tag creation functions (`createTag`, `updateTag`, `deleteTag`) to use `window.auth.getToken()` instead of directly accessing localStorage.
  - Added enhanced error handling and debugging for tag creation API calls.
  - Ensured consistent token management across all tag-related operations.
  - _Files: `frontend/script.js`_
- **Database Tag Constraint Issue:** Fixed database constraint violation that prevented users from creating tags with names that already existed for other users.
  - Created migration `024_fix_tags_constraint.sql` to update the database schema.
  - Dropped the old `tags_name_key` unique constraint that only considered tag names.
  - Added new `tags_name_user_id_key` constraint allowing the same tag name for different users.
  - Added proper user_id foreign key constraint and performance index.
  - _Files: `backend/migrations/024_fix_tags_constraint.sql`_
- **About Page User Menu Issue:** Fixed user menu dropdown not functioning on the about page for SSO users.
  - Resolved script loading order conflicts that prevented user menu event listeners from being attached.
  - Moved inline authentication check from head to body to prevent timing conflicts with `auth.js`.
  - Added backup user menu handler specifically for the about page with enhanced debugging.
  - Fixed JavaScript error caused by `getEventListeners` function not being available in all browsers.
  - _Files: `frontend/about.html`, `frontend/auth.js`_
- **About Page Logout Issue:** Resolved logout functionality errors on the about page.
  - Added safe loading spinner functions specifically for the about page to prevent `TypeError: Cannot read properties of null (reading 'classList')` error.
  - Implemented backup logout handler with multiple fallback levels for reliability.
  - Ensured logout works even when main auth system encounters errors.
  - _Files: `frontend/about.html`, `frontend/script.js`_
- **Immediate Warranty Updates:** Optimized warranty editing for instant UI updates without server reloads.
  - **Performance Improvement:** Warranty changes now appear immediately in the UI instead of waiting for server data reload.
  - **Local Data Sync:** Edit modal updates local warranty data instantly upon successful save, eliminating loading delays.
  - **Robust Date Handling:** Enhanced date arithmetic for duration-based warranties with proper month/year overflow handling.
  - **Complete Field Updates:** All warranty fields (product info, dates, serial numbers, tags, documents) update immediately in the interface.
  - **Fallback Safety:** Maintains fallback to server reload if local update fails, ensuring data consistency.
  - _Files: `frontend/script.js`_
- **Warranty Entry Method Persistence:** Fixed warranty entry method selection not being remembered correctly in edit modal.
  - **Issue:** When editing warranties that were created using "Exact Expiration Date" method, the edit modal would incorrectly switch to "Warranty Duration" method.
  - **Root Cause:** Display logic was overwriting original duration values (0,0,0 for exact date method), making method detection impossible.
  - **Solution:** Added `original_input_method` tracking to preserve the user's original warranty entry method choice.
  - **Data Separation:** Implemented separate `display_duration_*` fields for warranty card display while preserving original duration values for method detection.
  - **Enhanced Detection:** Edit modal now directly checks `original_input_method` field instead of guessing from duration data.
  - **Result:** Users can now edit warranties and the modal correctly remembers whether they originally used "Warranty Duration" or "Exact Expiration Date" method.
  - _Files: `frontend/script.js`_
- **Notes Modal and Edit Modal Integration:** Fixed issues with notes editing workflow and seamless transition to warranty editing.
  - **Notes Editing for Exact Date Warranties:** Resolved issue where warranties created with exact expiration dates couldn't have their notes edited via the notes-link modal due to invalid duration validation.
  - **Stale Notes in Edit Modal:** Fixed problem where editing a warranty immediately after saving notes via the notes modal would show old note content instead of the newly saved content.
  - **Notes Modal UI Issues:** Fixed "Edit Notes" button showing outdated note content when clicked after saving new notes in the same modal session.
  - **Enhanced Notes Modal:** Added "Edit Warranty" button directly in the notes modal footer for seamless transition to full warranty editing without modal layering conflicts.
  - **Immediate Data Sync:** Enhanced notes saving to immediately update the global warranties array, ensuring edit modal always shows current data.
  - **Modal State Management:** Improved modal closing behavior when opening edit modal from notes modal to prevent UI conflicts.
  - _Files: `frontend/script.js`_
- **Status Page Edit Modal Consistency:** Fixed inconsistency between edit warranty modals on index.html and status.html pages.
  - **Missing Warranty Entry Method Selection:** Added the "Warranty Entry Method" radio button selection to the status.html edit modal, allowing users to choose between "Warranty Duration" and "Exact Expiration Date" methods.
  - **Missing Exact Expiration Field:** Added the hidden "Exact Expiration Date" input field that appears when the exact date method is selected.
  - **Feature Parity:** The edit warranty modal on status.html now has identical functionality to the one on index.html, ensuring consistent user experience across both pages.
  - **Complete Modal Structure:** All tabs (Product, Warranty, Documents, Tags), form fields, and functionality now match exactly between both pages.
  - _Files: `frontend/status.html`_

### Dependencies
- **Updated Python Dependencies:** Resolved `pkg_resources` deprecation warning by updating backend dependencies to modern versions.
  - **Gunicorn:** Updated from `20.1.0` to `23.0.0` - eliminates `pkg_resources` deprecation warning by using `importlib.metadata` instead.
  - **Flask:** Updated from `2.0.1` to `3.0.3` - includes security patches and improved compatibility.
  - **Werkzeug:** Updated from `2.0.1` to `3.0.3` - maintains compatibility with Flask 3.x.
  - **Other Dependencies:** Updated `flask-cors`, `Flask-Login`, `PyJWT`, `email-validator`, `python-dateutil`, `Authlib`, `requests`, and `gevent` to latest stable versions.
  - **Setuptools Protection:** Added `setuptools<81` pin to prevent future compatibility issues.
  - _Files: `backend/requirements.txt`_

### Frontend
- **Chart.js Compatibility Fix:** Resolved "Chart is not defined" error on status page by replacing ES module version with UMD version.
  - **Issue:** Status page charts failed to load with `ReferenceError: Chart is not defined` because the local `chart.js` file was in ES module format.
  - **Root Cause:** ES modules require `<script type="module">` tags but the HTML was using regular `<script>` tags.
  - **Solution:** Replaced ES module version with locally downloaded UMD (Universal Module Definition) version from Chart.js v4.4.9, eliminating CDN dependency.
  - **Result:** Chart.js now loads properly with regular script tags and status page charts display correctly using the local file.
  - _Files: `frontend/chart.js`_
- **Product Name Hover Tooltips:** Added hover tooltips to display full product names when they are truncated with ellipsis.
  - **Enhancement:** Long product names that get cut off with "..." now show the complete product name in a tooltip when hovered over.
  - **Coverage:** Works across all warranty display modes (grid view, list view, table view) on the main warranties page and the status page table.
  - **Implementation:** Added `title` attributes to warranty titles and product name cells using escaped HTML for security.
  - **Result:** Users can now see full product names without having to edit or expand warranty details.
  - _Files: `frontend/script.js`, `frontend/status.js`_
- **Powered by Warracker Footer:** Added branded footer to all pages with dynamic theme support and GitHub repository link.
  - **Feature:** Added "Powered by Warracker" footer to all application pages linking to the GitHub repository.
  - **Theme Support:** Implemented JavaScript-based dynamic styling that automatically adapts to light/dark mode changes.
  - **Light Mode:** Light gray background (`#f5f5f5`), dark text (`#333333`), blue links (`#3498db`) matching the logo.
  - **Dark Mode:** Dark background (`#1a1a1a`), light text (`#e0e0e0`), light blue links (`#4dabf7`).
  - **Real-time Updates:** Uses MutationObserver to detect theme changes and update footer styling automatically.
  - **Cross-domain Compatibility:** Includes fallback inline styles and direct color values to ensure consistent display across different hosting environments.
  - _Files: All frontend HTML pages, `frontend/style.css`_

## [0.9.9.8] - 2025-05-24

### Added
- **Account Email Change:** Users can now change the email address associated with their account from the Settings page.
  - The email field in Account Settings is now editable.
  - Client-side and backend validation ensure the new email is valid and not already in use by another account.
  - The backend prevents duplicate emails and returns clear error messages for conflicts or invalid formats.
  - On successful change, the new email is reflected in the UI and localStorage, and users must use the new email to log in.
  - _Files: `frontend/settings-new.html`, `frontend/settings-new.js`, `backend/app.py`_
- **Progressive Web App (PWA) Support:** Enabled the application to be installed on Android devices.
  - Added and configured `manifest.json` with necessary properties (name, short_name, icons, start_url, display, orientation, theme_color, background_color, description).
  - Implemented a basic service worker (`sw.js`) with a cache-first strategy for core assets (HTML, CSS, JS, manifest, icons) to enable offline access and faster loading.
  - Registered the service worker in `script.js`.
  - Ensured `index.html` links to the `manifest.json` file.
  - Updated icon set in `manifest.json` and `sw.js` to use 16x16, 32x32, and 512x512 favicons.
  - _Files: `frontend/manifest.json`, `frontend/sw.js`, `frontend/script.js`, `frontend/index.html`_
- **Manage Tags Button on Index Page:** Added a "Manage Tags" button to the filter controls section on the main warranties page (`index.html`).
  - Clicking this button opens the tag management modal, which is now centered on the screen.
  - _Files: `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

### Changed
- **Mobile/Tablet Responsiveness:** Updated `index.html` , `status.html`  and associated CSS to improve the layout and usability of grid and list views on mobile and tablet devices.
  - _Files: `frontend/index.html`, `frontend/status.html`, `frontend/style.css` , `frontend/mobile-header.css`_
- **Database Credential Handling (Contribution by @humrochagf):** Replaced hardcoded database credentials with environment variable references for improved security and maintainability (Commit: 20997e9).
  - Removed hardcoded `db_user`, `db_admin_user`, and `db_admin_password` values.
  - Updated Dockerfile to eliminate redundant superuser credential checks.
  - Ensured `DB_ADMIN_PASSWORD` is configurable via Docker Compose environment variables, removing manual post-deployment steps.
  - Adjusted scripts to rely on dynamic credentials set in the environment.
  - _Files: `Dockerfile`, `backend/app.py`, `backend/fix_permissions.py`, `backend/fix_permissions.sql`, `backend/migrations/010_configure_admin_roles.sql`, `backend/migrations/011_ensure_admin_permissions.sql`, `backend/migrations/apply_migrations.py`, `docker-compose.yml`_

## [0.9.9.7] - 2025-05-16

### Added
- **Status Page - Collapsible Warranty Details**: Users can now click on a warranty row in the "Recently Expired or Expiring Soon" table on the Status page to expand a details section inline. This section displays more comprehensive information about the warranty, including Product URL, Purchase Price, Vendor, links to documents (Invoice, Manual, Other Files), Serial Numbers, and Notes.
  - Clicking the same row again collapses the details view.
  - Only one warranty's details can be expanded at a time.
  _Files: `frontend/status.js`, `frontend/style.css`_
- **Edit Warranty from Status Page**: You can now edit warranty details directly from the status page by clicking the "Edit Warranty" button in the expanded details section. This opens the edit modal with all warranty information pre-filled for editing.
  _Files: `frontend/status.js`, `frontend/script.js`, `frontend/style.css`_
- Added vendor column to sort options on the main warranty list.
  _Files: `frontend/index.html`, `frontend/script.js`_
- Added vendor filter dropdown to the main warranty list.
  _Files: `frontend/index.html`, `frontend/script.js`_

### Changed
- **Status Page Table**: Modified the Status page table to no longer link product names directly to a separate details page (related to the collapsible details feature).
  _Files: `frontend/status.js`_
- Updated CSV export functionality to format dates as YYYY-MM-DD.
  _Files: `frontend/script.js`, `frontend/status.js`_

### Fixed
- Fixed a console error "An invalid form control with name='product_url' is not focusable" that occurred when entering a product URL without a scheme (e.g., "example.com") in a hidden tab.
  - Changed `productUrl` and `editProductUrl` input types from `url` to `text` in `frontend/index.html` to prevent premature browser validation conflicts with the tabbed interface.
  - Enhanced `validateTab`, `showValidationErrors`, and `validateEditTab` in `frontend/script.js` to more reliably use HTML5 `control.validity.valid` and `control.validationMessage`, ensuring that if a field is invalid, its tab is shown and JavaScript-driven error messages are displayed.
  _Files: `frontend/script.js`_
- Resolved issue where the edit modal would close on backdrop click; it now only closes via the 'X' or 'Cancel' buttons.
  _Files: `frontend/script.js`_
- Resolved an issue where database migrations could fail if a custom `DB_NAME` was used. The hardcoded database name has been removed from migration files to support custom database names. (Thanks to @humrochagf for the contribution!)
  _Files: `backend/migrations/010_configure_admin_roles.sql`, `backend/migrations/011_ensure_admin_permissions.sql`_

## [0.9.9.6] - 2025-05-11

### Added
- **Warranty Duration Input:** Replaced the single "Warranty Period (Years)" input field with separate fields for Years, Months, and Days when adding or editing warranties.
  - Allows for more precise warranty duration entry (e.g., 2 years, 6 months, 15 days).
  - Updated Add/Edit forms (`frontend/index.html`), JavaScript logic (`frontend/script.js`), CSS styling (`frontend/style.css`), backend API (`backend/app.py`), and database schema (`backend/migrations/021_change_warranty_duration_to_components.sql`).
  - Warranty display on cards and summaries now shows the formatted duration (e.g., "2 years, 6 months").
  - CSV import/export updated to use `WarrantyDurationYears`, `WarrantyDurationMonths`, `WarrantyDurationDays` columns.
  - Backend validation ensures at least one duration component is provided for non-lifetime warranties.
  - Fixed backend logic to correctly handle empty duration inputs, treating them as 0.
  _Files: `backend/app.py`, `backend/migrations/021_change_warranty_duration_to_components.sql`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_
- **Files Upload:** Users can now upload an additional ZIP/RAR file (e.g., for extended warranty documents, photos, or other related files) when adding or editing a warranty.
  - This document is stored securely and can be accessed from the warranty card.
  - _Files: `backend/app.py`, `backend/migrations/022_add_other_document_path.sql`, `frontend/index.html`, `frontend/script.js`_
- **Configurable JWT Secret Key:**
  - The application's JWT and session secret key can now be configured via the `SECRET_KEY` environment variable.
  - It is strongly recommended to set a unique, strong secret key in production environments. Defaults to a development key if not set.
  - _Relevant File: `backend/app.py` (for usage), `docker-compose.yml` (for setting)_
- **Configurable File Upload Limits:**
  - Maximum file upload sizes for both the backend application and the Nginx reverse proxy are now configurable via environment variables.
  - **Application (Flask):** Set `MAX_UPLOAD_MB` (e.g., `MAX_UPLOAD_MB=64`) to define the limit in megabytes. Defaults to 32MB.
  - **Nginx:** Set `NGINX_MAX_BODY_SIZE_VALUE` (e.g., `NGINX_MAX_BODY_SIZE_VALUE=64M`) to define the limit for Nginx (value must include unit like M or G). Defaults to "32M".
  - The `Dockerfile` and `nginx.conf` have been updated to support this.
  - _Files: `backend/app.py`, `nginx.conf`, `Dockerfile`_
- **Security key can be used in environment:**
   - **SECRET_KEY=**  is now usuable in docker-compose for jwt secret.
   - _Files: `Docker/docker-compose.yml`_

### Fixed
- **Backend Indentation Error:** Corrected an `IndentationError` in `backend/app.py` within the CSV import logic that prevented the backend from starting correctly.
  _Files: `backend/app.py`_
- **Migration Script Error:** Fixed an error in migration `021_change_warranty_duration_to_components.sql` where it incorrectly referenced `lifetime_warranty` instead of the correct `is_lifetime` column.
  _Files: `backend/migrations/021_change_warranty_duration_to_components.sql`_
- **smtplib import duplicate:** Removed line from app.py that re-imported smtplib with a pull request.
- _Files: `backend/app.py`_

### House Cleaning
- **Old Settings files:** Removed all older settings pages , and related files.
- _Files: `frontend/settings.html`,`frontend/settings.script.js`,`frontend/settings_redirect.html`_

## [0.9.9.5] - 2025-05-07

### Changed
- **Header Branding Improvement:**
  - Made the "Warracker" text in the header of the Status, Settings, and About pages a clickable link to the home page (`index.html`) for improved navigation and consistency.
  _Files: `frontend/status.html`, `frontend/settings-new.html`, `frontend/about.html`_

- **Tag Dropdown Color Removal:**
  - Removed all background and text colours from the tags dropdown in both dark mode and light mode for a cleaner, more consistent appearance.
  _Files: `frontend/style.css`, `frontend/script.js`, and any related tag dropdown CSS/JS._

- **Docker Base Image Update:**
  - Updated the `Dockerfile` to use Python 3.12 and Debian 12 (bookworm) as the base image for the container, ensuring improved compatibility and security.
  _File: `Dockerfile`_


## [0.9.9.4] - 2025-05-04

### Fixed
- **Theme Persistence & Consistency:**
  - Refactored dark mode logic to use only a single `localStorage` key (`darkMode`) as the source of truth for theme preference across all pages.
  - Removed all legacy and user-prefixed theme keys (e.g., `user_darkMode`, `admin_darkMode`, `${prefix}darkMode`).
  - Ensured all theme toggles and settings update only the `darkMode` key, and all pages read only this key for theme initialization.
  - Verified that `theme-loader.js` is included early in every HTML file to prevent flashes of incorrect theme.
  - Cleaned up redundant or conflicting theme logic in all frontend scripts and HTML files.
  - Theme preference now persists reliably across logins, logouts, and browser sessions (except in incognito/private mode, where localStorage is temporary by design).
  _Files: `frontend/script.js`, `frontend/settings-new.js`, `frontend/status.js`, `frontend/register.html`, `frontend/reset-password.html`, `frontend/reset-password-request.html`, `frontend/theme-loader.js`, all main HTML files._

### Added
- **Admin/User Tag Separation:**
  - Implemented distinct tags for Admins and regular Users.
  - Tags created by an Admin are only visible to other Admins.
  - Tags created by a User are only visible to other Users.
  - Added `is_admin_tag` boolean column to the `tags` table via migration (`backend/migrations/009_add_admin_flag_to_tags.sql`).
  - Backend API endpoints (`/api/tags`, `/api/warranties`, `/api/warranties/<id>/tags`) updated to filter tags based on the logged-in user's role (`is_admin`).
  - Tag creation (`POST /api/tags`) now automatically sets the `is_admin_tag` flag based on the creator's role.
  - Tag update (`PUT /api/tags/<id>`) and deletion (`DELETE /api/tags/<id>`) endpoints now prevent users/admins from modifying tags belonging to the other role.
  _Files: `backend/app.py`, `backend/migrations/009_add_admin_flag_to_tags.sql`_

  - **Version Check:**

  - Added a version checker to the About page (`frontend/about.html`) that compares the current version with the latest GitHub release and displays the update status.
    _Files: `frontend/about.html`, `frontend/version-checker.js`_

- **Mobile Home Screen Icon Support:**
  - Added support for mobile devices to display the app icon when added to the home screen.
  - Included `<link rel="apple-touch-icon" sizes="180x180">` for iOS devices, referencing a new 512x512 PNG icon.
  - Added a web app manifest (`manifest.json`) referencing the 512x512 icon for Android/Chrome home screen support.
  - Updated all main HTML files to include these tags for consistent experience across devices.
  _Files: `frontend/index.html`, `frontend/login.html`, `frontend/register.html`, `frontend/about.html`, `frontend/reset-password.html`, `frontend/reset-password-request.html`, `frontend/status.html`, `frontend/settings-new.html`, `frontend/manifest.json`, `frontend/img/favicon-512x512.png`_

- **Optional Vendor Field for Warranties:**
  - Users can now specify the vendor (e.g., Amazon, Best Buy) where a product was purchased, as an optional informational field for each warranty.
  - The field is available when adding a new warranty and when editing an existing warranty.
  - The vendor is displayed on warranty cards and in the summary tab of the add warranty wizard.
  - The vendor field is now searchable alongside product name, notes, and tags.
  - Backend API and database updated to support this field, including a migration to add the column to the warranties table.
  - Editing a warranty now correctly updates the vendor field.
  _Files: `backend/app.py`, `backend/migrations/017_add_vendor_to_warranties.sql`, `frontend/index.html`, `frontend/script.js`_

- **Serial Number Search:**
  - Enhanced search functionality to include serial numbers.
  - Updated search input placeholder text to reflect serial number search capability.
  _Files: `frontend/script.js`, `frontend/index.html`_

- **CSV Import Vendor Field:**
  - Added support for importing the `Vendor` field via CSV file upload.
  - The CSV header should be `Vendor`.
  _Files: `backend/app.py`, `frontend/script.js`_

- **Date Format Customization:**
  - Users can now choose their preferred date display format in Settings > Preferences.
  - Available formats include:
    - Month/Day/Year (e.g., 12/31/2024)
    - Day/Month/Year (e.g., 31/12/2024)
    - Year-Month-Day (e.g., 2024-12-31)
    - Mon Day, Year (e.g., Dec 31, 2024)
    - Day Mon Year (e.g., 31 Dec 2024)
    - Year Mon Day (e.g., 2024 Dec 31)
  - The selected format is applied to purchase and expiration dates on warranty cards.
  - The setting persists across sessions and is synchronized between open tabs.
  _Files: `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/script.js`_

- **IPv6 Support:** Added `listen [::]:80;` directive to the Nginx configuration (`nginx.conf`) to enable listening on IPv6 interfaces alongside IPv4.
  _Files: `nginx.conf`_

- **Cloudflare Compatibility:** Added `<script data-cfasync="false" src="/javascript.js">` to the `<head>` of the status page (`frontend/status.html`) to ensure proper loading when behind Cloudflare.
  _Files: `frontend/status.html`_

  ### Changed
  - **Migration System Overhaul:** Refactored the database migration system for improved reliability and consistency.
  - **House cleaning**: Removed redundant files such as migrations, .env, and uploads folder. 
  - **Warranty Listing:** Admins now only see their own warranties on the main warranty list (`/api/warranties`).
  - **Warranty Visibility:** Fixed issue where admins could see all users' warranties. Now both admins and regular users only see their own warranties on all pages.
  _Files: `backend/app.py`_

**Bug Fixes:**

*   **Date Handling:** Fixed issues causing warranty purchase and expiration dates to display incorrectly (off by one day) due to timezone differences:
    *   **Backend:** Corrected expiration date calculation in `backend/app.py` by removing the inaccurate `timedelta` fallback logic and ensuring the `python-dateutil` library (using `relativedelta`) is consistently used for accurate year addition.
    *   **Backend:** Added `python-dateutil` to `backend/requirements.txt` dependencies.
    *   **Frontend:** Updated date parsing in `frontend/script.js` (`processWarrantyData`) to use `Date.UTC()` when creating `Date` objects from `YYYY-MM-DD` strings, preventing local timezone interpretation.
    *   **Frontend:** Simplified and corrected date formatting in `frontend/script.js` (`formatDate`) to always use UTC date components (`getUTCFullYear`, etc.) for display, bypassing potential `toLocaleDateString` timezone issues.
    *   **Frontend:** Fixed purchase date display in the "Add Warranty" summary tab (`updateSummary` in `frontend/script.js`) by applying the same UTC-based parsing and formatting used elsewhere, resolving the off-by-one-day error during summary view.
*   **Fractional Warranty Years & Date Accuracy:** Corrected the backend expiration date calculation (`backend/app.py`) to accurately handle fractional warranty years (e.g., 1.5 years) and prevent off-by-one-day errors. 
    *   The initial fix for fractional years used an approximation (`timedelta`) which sometimes resulted in dates being a day early.
    *   The calculation now uses `dateutil.relativedelta` after decomposing the fractional years into integer years, months, and days, ensuring correct handling of leap years and month lengths.
*   **UI:** Fixed toasts overlapping header menu due to z-index conflict (`style.css`).
*   **API:** Fixed bug preventing updates to user preferences if only the timezone was changed (`app.py`).
*   **Settings:** Resolved issue where opening the settings page in multiple tabs could cause both tabs to refresh continuously and potentially log the user out. This involved:
    *   Preventing `settings-new.js` from unnecessarily updating `user_info` in `localStorage` on load.
    *   Changing the `storage` event listener in `include-auth-new.js` to update the UI directly instead of reloading the page when auth data changes.
    *   Removing redundant checks (`setInterval`) and `storage` listener from `fix-auth-buttons.js` to prevent conflicts.

**New Features & Enhancements:**

*   **API:** Added `/api/timezones` endpoint to provide a structured list of timezones grouped by region (`app.py`).

### Fixed
- **Tag Visibility:** Fixed an issue where tag visibility was incorrectly reversed between Admins and Users (Users saw Admin tags and vice-versa). Adjusted backend logic to correctly display tags based on role.
  _Files: `backend/app.py`_
- Fixed currency symbol not persisting after browser restart/re-login:
    - Prevented main warranty list from rendering before user authentication and preferences are fully loaded.
    - Ensured preferences (currency, date format, etc.) are fetched from API and saved to localStorage immediately after login.
    - Corrected inconsistent user type prefix (`user_` vs `admin_`) determination during initial page load.

## [0.9.9.3] - 2025-04-27

### Added

 - **Document Deletion in Edit Warranty:**
    - Users can now delete uploaded documents (Invoice/Receipt and Product Manual) when editing an existing warranty.
    - The edit modal now displays "Delete Invoice" and "Delete Manual" buttons if a document is present. Clicking these marks the document for deletion, which is processed when saving changes.
    - Backend and database are updated to remove the file from storage and clear the reference in the database.
  _Files: `backend/app.py`, `frontend/index.html`, `frontend/script.js`_

 - **Notes for Warranties:**
    - Users can now add, view, and edit freeform notes for each warranty.
    - Notes can be entered when adding or editing a warranty, and are accessible from the warranty card via a dedicated "Notes" link.
    - A modal dialog allows users to view and edit notes in place, with support for multi-line text and instant updates.
    - Notes are searchable and filterable alongside product names and tags.
    - Backend and database support for notes has been added, including migration and API changes.
    - UI includes clear styling for notes links and modal, with full support for both light and dark themes.
  _Files: `backend/app.py`, `backend/migrations/014_add_notes_to_warranties.sql`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

 - **Currency Symbol Customization:**
    - Users can now select their preferred currency symbol ($, €, £, ¥, ₹, or a custom one) in the settings page.
    - The selected symbol is now displayed next to purchase prices on warranty cards on the main page (`index.html`).
  _Files: `backend/app.py`, `backend/migrations/006_add_currency_symbol_column.py`, `frontend/settings-new.html`, `frontend/settings-new.js`, `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

 - **Password Reset Functionality:**
    - Users can now reset their password via a secure, token-based email workflow.
    - Added a "Forgot Password?" link on the login page that initiates the process.
    - Users receive an email with a unique link to set a new password.
    - Implemented frontend pages for requesting the reset and setting the new password.
    - Backend handles token generation, validation, email sending, and password updates.
  _Files: `backend/app.py`, `frontend/login.html`, `frontend/reset-password-request.html`, `frontend/reset-password.html`, `backend/migrations/003_add_users_table.sql` (or similar migration)_

### Changed
- **Status Page Table:** Removed the "Actions" column (and its buttons) from the "Recently Expired or Expiring Soon" table on `status.html` for a cleaner look.
- **Table Layout:** Updated the table and CSS to use dynamic column widths, eliminating empty space after the Status column and ensuring the table fills the available space naturally.
- **UI Polish:** Fixed awkward right-side spacing in the table and removed all flex styling and fixed-width rules for the last column, so the table now adapts responsively to its content.
- **CSS Cleanup:** Cleaned up and removed obsolete or conflicting CSS rules for the recent expirations table, resolving layout and syntax errors.
- **Status Page Table Sorting:**
    - Fixed date comparison logic in the sort function to correctly handle `Date` objects.
    - Refactored event listener attachment for sortable table headers to prevent duplicate listeners being added, resolving issues where sorting only worked once or behaved erratically.
    - Ensured all event listeners (sort, filter, search, export, refresh) are attached reliably after initial data load and rendering.
  _Files: `frontend/status.html`, `frontend/status.js`, `frontend/style.css`_

- **Mobile Export Button:** On mobile devices, the export button at the bottom of the status page now only displays the icon (no text), for a cleaner and more compact UI. The text remains visible on desktop.
- **Mobile Search Functionality:** The search box for recent expirations at the bottom of the status page now works correctly on mobile, with event listeners properly initialized to ensure filtering works as expected on all devices.
  _Files: `frontend/status.html`, `frontend/status.js`, `frontend/style.css`_

### Fixed
- **Settings Toggle Size:** Fixed inconsistent toggle switch sizing on mobile views, ensuring all toggles render at the correct dimensions (`47x24px`).
  _File: `frontend/settings-styles.css`_
- **Username Display:** Resolved an issue where user interface elements sometimes incorrectly displayed the username instead of the first name (or vice versa).
  _Files: `frontend/settings-new.js`, `frontend/auth.js` 
- **List/Table View:** Implemented updates and fixes for the warranty list and table views, improving layout and data presentation.
  _Files: `frontend/index.html`, `frontend/script.js`, `frontend/style.css`_

## [0.9.9.2] - 2025-04-20

### Added
- **Warranty Years (Fractional Support):**
  - You can now enter fractional (decimal) values for warranty periods (e.g., 1.5 years) when adding or editing warranties.
  - The backend, frontend UI, and CSV import/export all support decimal warranty years.
  - Validation and expiration date calculations have been updated to handle decimal years correctly.
  - The UI now allows decimal input for warranty years and displays fractional years in summaries and warranty lists.
  _Files: `backend/app.py`, `frontend/index.html`, `frontend/script.js`_
- **Import** button added, and functional. Must use CSV file format.
  - ## 📦 Product Information Entry Requirements

| Field Name     | Format / Example                          | Required?                                              | Notes                                                                 |
|----------------|-------------------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------|
| **ProductName** | Text                                       | ✅ Yes                                                  | Provide the name of the product.                                     |
| **PurchaseDate** | Date (`YYYY-MM-DD`, e.g., `2024-05-21`)   | ✅ Yes                                                  | Use ISO format only.                                                 |
| **WarrantyYears** | Whole Number (`1`, `3`, `10`)             | ✅ Yes, unless `IsLifetime` is `TRUE`                   | Must be between `1` and `100` if provided.                           |
| **IsLifetime**  | `TRUE` or `FALSE` (case-insensitive)       | ❌ No (Optional)                                        | If omitted, defaults to `FALSE`.                                     |
| **PurchasePrice** | Number (`199.99`, `50`)                  | ❌ No (Optional)                                        | Cannot be negative if provided.                                      |
| **SerialNumber** | Text (`SN123`, `SN123,SN456`)             | ❌ No (Optional)                                        | For multiple values, separate with commas.                           |
| **ProductURL**   | Text (URL format)                         | ❌ No (Optional)                                        | Full URL to product page (optional field).                           |
| **Tags**         | Text (`tag1,tag2`)                        | ❌ No (Optional)                                        | Use comma-separated values for multiple tags.                        |


### Changed
- **Theme:** Unified theme persistence using a single `localStorage` key (`darkMode`) and centralized the loading logic in `theme-loader.js` to enhance consistency and eliminate theme-flashing on load.  
  _Files: `frontend/theme-loader.js`, `frontend/script.js`, `frontend/status.js`, `frontend/settings-new.js`, `frontend/settings-new.html`_

- **UI/UX:** Updated the "Add Warranty" modal behavior to only close when the internal 'X' button is clicked. Clicking the backdrop no longer closes the modal. This change is specific to this modal—others retain default backdrop behavior.  
  _File: `frontend/script.js`_

### Fixed
- **Wizard Navigation:** 
  - Ensured the summary tab in the "Add Warranty" wizard displays and updates correctly.  
  - Resolved JS errors (`TypeError: Assignment to constant variable`, `ReferenceError: tabs is not defined`) that affected tab functionality.  
  - Fixed scope issues with backdrop click handlers impacting modal behavior.  
  _File: `frontend/script.js`_

- **Header Layout (Desktop):** Standardized header layout across pages by wrapping elements in a `.header-right-group` container and applying consistent styles.  
  _Files: `index.html`, `status.html`, `about.html`, `settings-new.html`, `frontend/header-fix.css`_

- **Header Layout (Mobile):** Corrected alignment of header elements—title is now left-aligned, user/settings icons right-aligned, and navigation links centered below. Used `!important` to resolve conflicts with desktop styles.  
  _File: `frontend/mobile-header.css`_

- **Theme:** Fixed site-wide dark/light mode persistence. Changes made on one page now reflect consistently across all pages. Standardized use of `darkMode` and `${prefix}darkMode` keys in relevant scripts.  
  _Files: `frontend/status.js`, others using `setTheme` / `initializeTheme`_

- **User Menu:** Fixed dropdown not opening due to a variable typo. Centralized gear menu toggle logic into `auth.js` for consistent behavior, removing redundant initializations.  
  _Files: `frontend/auth.js`, `frontend/script.js`, `frontend/settings-new.js`_

- **JavaScript Errors:** Addressed multiple errors (`ReferenceError`, `TypeError`) related to function order, missing element checks, and incorrect variable usage—primarily impacting `status.html` and pages using `script.js`.  
  _Files: `frontend/script.js`, `frontend/status.js`_

- **API Integration:** Fixed parsing logic for `/api/statistics` response to correctly interpret the API structure.  
  _File: `frontend/status.js`_

### Removed
- **Settings Gear Icon:** The settings gear icon button and its menu have been removed from the header in all main pages for a cleaner and less redundant UI. 
  _Files: `frontend/index.html`, `frontend/status.html`, `frontend/about.html`_


## [0.9.9.1] - 2025-04-13

### Added
- **About Page:** Added a new "About" page accessible via `/about.html` (`frontend/about.html`).
  - Displays application version, links to GitHub repository, releases, author profile, license (AGPL-3.0), and issue tracker.
- **UI:** Added an "About" link to the user menu dropdown in the header, appearing after "Settings" (`frontend/index.html`, `frontend/status.html`, `frontend/settings-new.html`).
- **UI/UX:** Refactored the "Add New Warranty" form into a modal dialog (`#addWarrantyModal`) triggered by a button click, instead of being always visible on the main page (`frontend/index.html`, `frontend/script.js`, `frontend/style.css`).
  - The modal is initially hidden and displayed using JavaScript.
  - Added event listeners to show/hide the modal on button click, close button click, and backdrop click.
  - Implemented `resetAddWarrantyWizard` function to clear the form, reset tabs, tags, and file inputs when the modal is closed or submitted successfully.
  - Modified form submission (`submitForm`) to close and reset the modal upon success.
- **UI:** Moved the "Add New Warranty" button (`#showAddWarrantyBtn`) from the top of the main content area into the header of the "Your Warranties" panel (`.panel-header`) for better context (`frontend/index.html`).
- **Layout:** Adjusted the `.warranties-panel` CSS to span the full width (`grid-column: 1 / -1;`) after the form was moved out of the main grid flow (`frontend/style.css`).
- **Layout:** Updated `.panel-header` CSS to use Flexbox for aligning the title (`h2`) to the left and action buttons (`.panel-header-actions` containing Add Warranty and Refresh buttons) to the right (`frontend/style.css`).
- **Layout:** Removed the `border-bottom` style from the `.panel-header` / `.warranties-panel h2` for a cleaner look (`frontend/style.css`).
- **Branding:** Updated the website `<title>` to include "Warracker" (`frontend/index.html`).
- **UI:** Added an "Add New Warranty" button (`#showAddWarrantyBtn`) to trigger the new modal (`frontend/index.html`