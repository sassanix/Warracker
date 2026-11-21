"""Status-page Edit and notes Edit Notes (1.0.7 adjacent fixes).

Pins for the two fixes Sassan ordered before 1.0.7:
- status.html must load the serialNumbers module, because the
  legacy openEditModal in script.js calls the bare
  window.addSerialNumberInput, which only exists on pages that load
  the js/index.js module tree. Without it the Edit button throws
  ReferenceError and the modal never opens.
- The legacy openEditModal method detection must infer the
  exact-date method from zero duration plus an expiration date: the
  status page passes raw API objects that never went through the
  list processing that computes original_input_method, so without
  the inference an exact-date warranty opens with the duration
  method selected and all-zero duration, and the legacy save
  validation refuses it.
- notes.js must disable the Edit Notes button for non-owners, the
  same as the Edit Warranty button, because notes save through the
  same ownership-gated PUT.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_status_page_loads_serial_numbers_module():
    html = (REPO / "frontend" / "status.html").read_text()
    assert 'type="module"' in html
    assert "js/components/serialNumbers.js" in html


def test_legacy_edit_modal_infers_exact_date_method():
    script = (REPO / "frontend" / "script.js").read_text()
    assert "warranty.original_input_method === 'exact_date' ||" in script
    assert "warranty_duration_years || 0) === 0" in script


def test_notes_modal_disables_edit_notes_for_non_owners():
    notes = (REPO / "frontend" / "js" / "components" / "notes.js").read_text()
    assert "refs.editBtn.disabled = !canEdit" in notes
    assert "refs.editBtn.title = 'View only - not your warranty'" in notes
    assert "refs.editWarrantyBtn.disabled = !canEdit" in notes
    assert "refs.editWarrantyBtn.title = 'View only - not your warranty'" in notes


def test_status_page_disables_edit_button_for_non_owners():
    status_js = (REPO / "frontend" / "status.js").read_text()
    assert "function canEditWarranty(warrantyUserId)" in status_js
    assert "user_id: warranty.user_id" in status_js
    assert 'disabled title="View only - not your warranty"' in status_js


def test_total_value_card_has_z_index_above_charts():
    css = (REPO / "frontend" / "style.css").read_text()
    selector = '.status-card[data-status="total_value"] {'
    assert selector in css
    idx = css.index(selector)
    block = css[idx:css.index("}", idx) + 1]
    assert "z-index:" in block


def test_warranty_list_stops_after_logout_before_second_fetch():
    controller = (
        REPO / "frontend" / "js" / "controllers" / "warrantyListController.js"
    ).read_text()
    first_fetch = controller.index("const primary = await listWarranties(")
    archived_fetch = controller.index("listWarranties({ scope, archived: true })")
    between = controller[first_fetch:archived_fetch]
    assert "if (!authService.isAuthenticated())" in between
