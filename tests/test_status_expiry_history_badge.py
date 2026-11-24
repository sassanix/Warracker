"""Status page expiry-history badge (issue #209 follow-up).

Pins for the one-line fix: updateRecentExpirations in status.js
rebuilds each warranty into a new object with an explicit field
list, and expiry_change_count was not in it. The row builder and
the expanded-row renderer both read the count off that cached
object, so the badge never rendered and the history section never
appeared on the Status page, even though the API returns the count.
The live probe probe_expiry_history_main.py checks the rendered
page in the browser (T3b).
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def _status_js():
    return (REPO / "frontend" / "status.js").read_text()


def test_status_mapping_carries_expiry_change_count():
    js = _status_js()
    match = re.search(
        r"allWarranties = recentWarrantiesData\.map\(warranty => \(\{(.*?)\}\)\);",
        js,
        re.DOTALL,
    )
    assert match is not None
    assert "expiry_change_count" in match.group(1)


def test_status_row_and_detail_read_the_count():
    js = _status_js()
    assert "Number(warranty.expiry_change_count)" in js
    assert "Number(warrantyDetails.expiry_change_count)" in js
