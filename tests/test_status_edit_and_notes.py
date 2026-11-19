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
