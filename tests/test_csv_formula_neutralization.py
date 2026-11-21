"""CSV-02: exported CSV must not carry live formulas.

A value starting with =, +, -, @, tab, or carriage return is
evaluated as a formula by spreadsheet apps on import. Both exporters
neutralize such values with a tab prefix, which the importer strips
on re-import, so an export round-trips to the stored value. These
pins fail if an exporter quotes a field without neutralizing it.
"""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

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


def _extract_neutralizer_js(source, pattern):
    match = re.search(pattern, source, re.S)
    assert match, f"could not extract neutralizeCsvFormula with {pattern}"
    return match.group(0)


def test_neutralize_csv_formula_behavior_in_both_exporters():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")

    main_src = (REPO / "frontend" / "js" / "components"
                / "importExport.js").read_text()
    status_src = (REPO / "frontend" / "status.js").read_text()

    main_fn = _extract_neutralizer_js(
        main_src, r"export function neutralizeCsvFormula\(value\)\s*\{.*?\n\}"
    ).replace("export ", "", 1)
    status_fn = _extract_neutralizer_js(
        status_src, r"const neutralizeCsvFormula = \(value\) => \{.*?\n\s*\};"
    )

    script = """
    const cases = [
      ['=1+1', '\\t=1+1'],
      ['+1+1', '\\t+1+1'],
      ['-1+1', '\\t-1+1'],
      ['@SUM(1,2)', '\\t@SUM(1,2)'],
      ['   =1+1', '\\t   =1+1'],
      ['\\n=1+1', '\\t\\n=1+1'],
      ['\\tfoo', '\\t\\tfoo'],
      ['  \\tfoo', '\\t  \\tfoo'],
      ['\\t=1+1', '\\t\\t=1+1'],
      ['\\rfoo', '\\t\\rfoo'],
      ['  \\rfoo', '\\t  \\rfoo'],
      ['Widget', 'Widget'],
      ['  Widget', '  Widget'],
      ['123', '123'],
      ['', ''],
    ];
    for (const [input, expected] of cases) {
      const actual = neutralizeCsvFormula(input);
      if (actual !== expected) {
        throw new Error(
          `Input ${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
      }
    }
    """

    for name, fn_code in (("importExport.js", main_fn), ("status.js", status_fn)):
        r = subprocess.run(
            [node, "-e", fn_code + "\n" + script],
            capture_output=True, text=True,
        )
        assert r.returncode == 0, f"{name}: {r.stderr}"


def test_csv_import_strips_tab_neutralization_prefix_on_round_trip(
        client, user_factory, db_connection):
    import io
    user = user_factory()
    csv_body = (
        "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,"
        "WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,"
        "Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n"
        '"\t=SUM(1,2)",2025-01-15,FALSE,1,0,0,,"",,,,,"\t+Acme"\n'
    )
    r = client.post(
        "/api/warranties/import",
        headers=user["headers"],
        data={"csv_file": (io.BytesIO(csv_body.encode("utf-8")), "export.csv")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["success_count"] == 1
    with db_connection.cursor() as cur:
        cur.execute(
            "SELECT product_name, vendor FROM warranties WHERE product_name = %s",
            ("=SUM(1,2)",),
        )
        row = cur.fetchone()
        assert row == ("=SUM(1,2)", "+Acme")
