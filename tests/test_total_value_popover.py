"""Total Value popover stacking (fixed in 1.0.7 by 119f455).

Pins for the fix Sassan reported from his phone: the Total Value
popover was painted behind the pie chart on the status page, on
desktop and mobile. The card's hover lift transform makes the card
a stacking context, which traps the popover below the charts that
follow it, no matter how high the popover's own z-index is. The fix
is a z-index on the card itself. The status page is the only page
that carries this popover (index.html has no Total Value card), and
it loads style.css, so the same rule covers it; the live probe
probe_total_value_popover.py checks both viewports in the browser.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_total_value_card_carries_stacking_z_index():
    css = (REPO / "frontend" / "style.css").read_text()
    match = re.search(
        r'\.status-card\[data-status="total_value"\]\s*\{([^}]*)\}', css
    )
    assert match is not None
    assert "z-index: 2" in match.group(1)


def test_status_page_carries_popover_and_loads_the_fix():
    html = (REPO / "frontend" / "status.html").read_text()
    assert 'id="totalValueCard"' in html
    assert 'id="totalValuePopover"' in html
    assert 'href="style.css' in html
    card_pos = html.index('id="totalValueCard"')
    pop_pos = html.index('id="totalValuePopover"')
    assert card_pos < pop_pos
