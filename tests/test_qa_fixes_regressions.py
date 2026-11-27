"""Regression tests for desktop, tablet, and mobile QA walkthrough fixes.

Pins behavioral and structural guarantees across Workstreams 1-3:
- editModal.js populates invoice_url, manual_url, and other_document_url on open
- notes.js serializes vendor and model_number directly from warranty (never hidden edit DOM)
- tagManager.js and script.js share DOM guards to prevent duplicate tag requests
- reset-password.html hoists submitBtn/originalBtnText above try/catch
- importExport.js filterWarrantiesForExport matches list filters (archived + model/serial/notes)
- /api/timezones includes UTC so the default timezone is selectable
- settings-new.js resolves currency symbols (e.g. '$') to option codes ('USD') and loads both timezone selects
- locales/*/translation.json omit literal <strong> tags from settings.oidc_only_mode_desc
- status.js skips archived and voided warranties in extractTimelineData and uses dark-mode chart colors
- warrantyRenderer.js emits standard status modifier classes in Table View
- paperless.js exports isPaperlessEnabled() and claims.js gates .claim-doc-storage on it
- mobile-header.css does not force display: block !important on #scopeDropdown and aligns mobile popovers
- style.css cleans up dead Unsplash 404 URLs, fixes Tag color picker, mobile Status search, and dark Void contrast
- mobile-menu.js hides empty hamburger drawers; auth pages remove unused hamburger toggles
- settings-new.html omits leftover developer Emergency Delete fallback buttons
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "frontend"
LOCALES = REPO / "locales"


def test_edit_modal_populates_and_trims_document_urls():
    src = (FRONTEND / "js" / "components" / "editModal.js").read_text(encoding="utf-8")
    pop_start = src.index("function populateDocuments(warranty)")
    pop_end = src.index("export async function saveWarranty()")
    pop_body = src[pop_start:pop_end]

    assert "document.getElementById('editInvoiceUrl')" in pop_body
    assert "warranty.invoice_url || ''" in pop_body
    assert "document.getElementById('editManualUrl')" in pop_body
    assert "warranty.manual_url || ''" in pop_body
    assert "document.getElementById('editOtherDocumentUrl')" in pop_body
    assert "warranty.other_document_url || ''" in pop_body

    save_body = src[pop_end:]
    assert "document.getElementById('editInvoiceUrl') || {}).value || '').trim()" in save_body
    assert "document.getElementById('editManualUrl') || {}).value || '').trim()" in save_body
    assert "document.getElementById('editOtherDocumentUrl') || {}).value || '').trim()" in save_body


def test_notes_build_form_data_does_not_read_hidden_edit_modal_inputs():
    src = (FRONTEND / "js" / "components" / "notes.js").read_text(encoding="utf-8")
    start = src.index("function buildFormData(warranty, noteValue)")
    end = src.index("async function refreshWarranties()")
    body = src[start:end]

    assert "editModelNumber" not in body
    assert "editVendorOrRetailer" not in body
    assert "formData.append('vendor', warranty.vendor)" in body
    assert "formData.append('model_number', warranty.model_number)" in body


def test_tag_manager_and_legacy_script_share_dom_guards():
    tm = (FRONTEND / "js" / "components" / "tagManager.js").read_text(encoding="utf-8")
    legacy = (FRONTEND / "script.js").read_text(encoding="utf-8")

    # Shared DOM guards on #existingTags and #newTagForm
    assert "container.dataset.tmListenersAttached === 'true'" in tm
    assert "container.dataset.tmListenersAttached = 'true'" in tm
    assert "form.dataset.tagFormBound !== 'true'" in tm
    assert "form.dataset.tagFormBound = 'true'" in tm

    assert "globalNewTagForm.dataset.tagFormBound !== 'true'" in legacy
    assert "globalNewTagForm.dataset.tagFormBound = 'true'" in legacy
    assert "window.components && window.components.tagManager" in legacy


def test_reset_password_declares_submit_btn_outside_try():
    html = (FRONTEND / "reset-password.html").read_text(encoding="utf-8")
    btn_decl = html.index("const submitBtn = passwordResetForm.querySelector('button[type=\"submit\"]');")
    orig_decl = html.index("const originalBtnText = submitBtn ? submitBtn.innerHTML : '';")
    try_pos = html.index("try {", btn_decl - 200)

    assert btn_decl < try_pos
    assert orig_decl < try_pos


def test_import_export_filter_matches_list_controller_behavior():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")

    script = """
    globalThis.window = globalThis;
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const { filterWarrantiesForExport } = await import('./frontend/js/components/importExport.js');
    const sample = [
      {
        id: 1,
        product_name: 'Laptop',
        vendor: 'Lenovo',
        status: 'active',
        is_archived: false,
        model_number: 'X1C-GEN12',
        serial_numbers: ['SN-ALPHA-99'],
        notes: 'Extended onsite support',
        tags: [{ id: 10, name: 'Work' }],
        warranty_type: 'manufacturer',
      },
      {
        id: 2,
        product_name: 'Old Monitor',
        vendor: 'Dell',
        status: 'expired',
        is_archived: true,
        model_number: 'U2720Q',
        serial_numbers: ['SN-ARCH-01'],
        notes: 'Retired from desk',
        tags: [{ id: 11, name: 'Home' }],
        warranty_type: 'extended',
      },
      {
        id: 3,
        product_name: 'Mouse',
        vendor: 'Logitech',
        status: 'expired',
        is_archived: false,
        model_number: 'MX3S',
        serial_numbers: ['SN-MOUSE-7'],
        notes: '',
        tags: [],
        warranty_type: 'manufacturer',
      },
    ];

    const archivedOnly = filterWarrantiesForExport(sample, { status: 'archived' });
    if (archivedOnly.length !== 1 || archivedOnly[0].id !== 2) {
      throw new Error('archived filter failed: ' + JSON.stringify(archivedOnly));
    }
    const archivedFromArchivedEndpoint = filterWarrantiesForExport(
      [{ id: 9, product_name: 'Router', status: 'expired' }],
      { status: 'archived' },
      { isArchivedView: true }
    );
    if (archivedFromArchivedEndpoint.length !== 1 || archivedFromArchivedEndpoint[0].id !== 9) {
      throw new Error('archived view export failed when row omits is_archived');
    }
    const expiredNonArchived = filterWarrantiesForExport(sample, { status: 'expired' });
    if (expiredNonArchived.length !== 1 || expiredNonArchived[0].id !== 3) {
      throw new Error('expired filter should exclude archived: ' + JSON.stringify(expiredNonArchived));
    }
    const byModel = filterWarrantiesForExport(sample, { status: 'all', search: 'x1c-gen12' });
    if (byModel.length !== 1 || byModel[0].id !== 1) {
      throw new Error('model_number search failed');
    }
    const bySerial = filterWarrantiesForExport(sample, { status: 'all', search: 'sn-mouse-7' });
    if (bySerial.length !== 1 || bySerial[0].id !== 3) {
      throw new Error('serial_numbers search failed');
    }
    const byNotes = filterWarrantiesForExport(sample, { status: 'all', search: 'onsite support' });
    if (byNotes.length !== 1 || byNotes[0].id !== 1) {
      throw new Error('notes search failed');
    }
    console.log('OK');
    """
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        cwd=str(REPO),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
    assert "OK" in result.stdout


def test_backend_timezones_route_includes_utc():
    src = (REPO / "backend" / "warranties_routes.py").read_text(encoding="utf-8")
    start = src.index("def get_timezones():")
    end = src.index("except Exception as e:", start)
    body = src[start:end]

    assert "'region': 'UTC'" in body
    assert "'value': 'UTC'" in body


def test_settings_resolves_currency_symbols_and_loads_both_timezone_selects():
    src = (FRONTEND / "settings-new.js").read_text(encoding="utf-8")
    assert "const resolveCurrencyOptionValue = (codeOrSymbol) =>" in src
    assert "currencySymbolSelect.value = resolvedCode;" in src
    assert "currencySymbolSelect.value = resolvedApiCode;" in src
    assert "tasks.push(loadTimezonesIntoSelect(userAppriseTimezoneSelect));" in src


def test_locales_and_settings_html_have_no_raw_strong_tags_in_oidc_desc():
    locale_files = sorted(LOCALES.glob("*/translation.json"))
    assert len(locale_files) >= 20
    offenders = []
    for path in locale_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        desc = data.get("settings", {}).get("oidc_only_mode_desc", "")
        if "<strong>" in desc or "</strong>" in desc:
            offenders.append(str(path.relative_to(REPO)))
    assert not offenders, f"Found literal <strong> tags in: {offenders}"

    html = (FRONTEND / "settings-new.html").read_text(encoding="utf-8")
    m = re.search(r'data-i18n="settings\.oidc_only_mode_desc"[^>]*>(.*?)</p>', html, re.S)
    assert m is not None
    assert "<strong>" not in m.group(1)


def test_status_timeline_excludes_archived_and_voided_and_supports_dark_charts():
    src = (FRONTEND / "status.js").read_text(encoding="utf-8")
    assert "if (w.is_lifetime || w.is_archived || w.is_voided) return;" in src
    assert "const isDark = document.documentElement.getAttribute('data-theme') === 'dark';" in src
    assert "legendColor = isDark ? '#e0e0e0'" in src


def test_table_view_emits_standard_status_classes():
    src = (FRONTEND / "js" / "components" / "warrantyRenderer.js").read_text(encoding="utf-8")
    start = src.index("function cardClassName(")
    end = src.index("function buildPhotoHtml(")
    body = src[start:end]

    assert "if (view === 'table') return `warranty-card ${modifier} status-${statusClass}`;" in body


def test_claims_hides_paperless_selector_when_paperless_disabled():
    paperless = (FRONTEND / "js" / "components" / "paperless.js").read_text(encoding="utf-8")
    claims = (FRONTEND / "js" / "components" / "claims.js").read_text(encoding="utf-8")

    assert "export function isPaperlessEnabled()" in paperless
    assert "import { isPaperlessEnabled } from './paperless.js';" in claims
    assert claims.count("isPaperlessEnabled()") >= 2


def test_mobile_header_scope_not_forced_and_popovers_aligned():
    css = (FRONTEND / "mobile-header.css").read_text(encoding="utf-8")

    # Tablet rule must not force display: block !important on #scopeDropdown
    tablet_start = css.index("@media (min-width: 481px) and (max-width: 768px)")
    tablet_end = css.index("@media (min-width: 600px) and (max-width: 768px)", tablet_start)
    tablet_block = css[tablet_start:tablet_end]
    scope_match = re.search(
        r"\.search-container\s+\.secondary-actions\s+#scopeDropdown\s*\{([^}]*)\}",
        tablet_block,
    )
    assert scope_match is not None
    assert "display:" not in scope_match.group(1)

    # Mobile popover alignment rules exist
    assert "#dataMenu," in css
    assert "#scopeMenu {" in css
    assert "#viewMenu {" in css


def test_auth_pages_and_mobile_menu_avoid_empty_drawer():
    mm = (FRONTEND / "mobile-menu.js").read_text(encoding="utf-8")
    assert "function hasNavigableItems(header)" in mm
    assert "if (!hasNavigableItems(header))" in mm
    assert "(isAuthenticated && userDropdown)" in mm

    for page in ("register.html", "reset-password-request.html", "reset-password.html"):
        html = (FRONTEND / page).read_text(encoding="utf-8")
        assert "mobile-menu-toggle" not in html, f"{page} still has empty mobile-menu-toggle"


def test_style_css_and_settings_cleanup_invariants():
    css = (FRONTEND / "style.css").read_text(encoding="utf-8")
    assert "photo-1586920740199-47ce3734a7a2" not in css
    assert ".grid-view .warranty-content:has(.product-photo-thumbnail)" in css
    assert ".table-view .warranty-card.archived .product-name-header .action-btn i" in css
    assert ":root[data-theme=\"dark\"] .status-void" in css
    assert ".table-actions .search-box" in css
    assert "min-width: 44px !important;" in css
    assert "grid-column: 1 / -1;" in css

    settings_html = (FRONTEND / "settings-new.html").read_text(encoding="utf-8")
    assert "emergencyDeleteBtn" not in settings_html
    assert "If the delete button doesn't work" not in settings_html
