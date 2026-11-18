"""CSV-02: exported CSV must not carry live formulas.

A value starting with =, +, -, @, tab, or carriage return is
evaluated as a formula by spreadsheet apps on import. Both exporters
neutralize such values with a tab prefix, which the importer strips
on re-import, so an export round-trips to the stored value. These
pins fail if an exporter quotes a field without neutralizing it.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_both_exporters_neutralize_formulas():
    main = (REPO / "frontend" / "js" / "components"
            / "importExport.js").read_text()
    status = (REPO / "frontend" / "status.js").read_text()
    for name, text in (("importExport.js", main), ("status.js", status)):
        assert "neutralizeCsvFormula" in text, name
        # Every quoting site passes through the neutralizer.
        assert 'neutralizeCsvFormula(String(field))' in text, name
    # No quoting site escapes a field without neutralizing it first.
    assert '"${String(field).replace' not in main, "importExport.js"
    assert '"${String(field).replace' not in status, "status.js"
    # The trigger set covers the OWASP formula starters.
    for trigger in ("'='", "'+'", "'-'", "'@'", "'\\t'", "'\\r'"):
        assert trigger in main, trigger
        assert trigger in status, trigger
