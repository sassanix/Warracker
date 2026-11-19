"""AUTH-03: auth-redirect.html inline script must parse.

ba00a85 put an `await` inside a plain (non-async) DOMContentLoaded
callback, so the whole inline script failed to parse and OIDC SSO
stalled at "Authenticating, please wait...". The callback must stay
async, and the page's inline scripts must keep passing node --check.
"""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

PAGE = Path(__file__).resolve().parent.parent / "frontend" / "auth-redirect.html"


def _inline_scripts():
    html = PAGE.read_text()
    return re.findall(r"<script>(.*?)</script>", html, re.S)


def test_auth_redirect_callback_is_async():
    html = PAGE.read_text()
    assert "addEventListener('DOMContentLoaded', async function" in html


def test_auth_redirect_inline_scripts_parse():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")
    scripts = _inline_scripts()
    assert scripts, "no inline scripts found in auth-redirect.html"
    with tempfile.NamedTemporaryFile(
            "w", suffix=".js", delete=False) as tmp:
        tmp.write("\n;\n".join(scripts))
        path = tmp.name
    r = subprocess.run([node, "--check", path],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
