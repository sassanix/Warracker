"""Regression guard for #293 (1.0.5 Docker image fails to start).

gunicorn's gevent worker imports the `packaging` module at worker
load, but gunicorn 26.2.0 declares `packaging` only under its
"gevent" extra. backend/requirements.txt installs plain gunicorn
(no extra), so without an explicit pin pip never installs packaging
and the shipped image crashes on boot with
"ModuleNotFoundError: No module named 'packaging'".

The 1.0.4 image worked because it copied the builder's whole
/usr/local, which carried packaging along; the 1.0.5 venv-only
image (91ed0d3) exposed the missing pin.

These tests pin the requirement in place and verify the worker
class loads with the installed dependency set. The clean-venv
verification (fresh venv from requirements.txt, then importing
gunicorn.workers.ggevent) is the end-to-end check; it is run at
release time because it needs network access to PyPI.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS = REPO_ROOT / "backend" / "requirements.txt"


def _requirement_lines():
    lines = []
    for raw in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            lines.append(line)
    return lines


def test_packaging_is_pinned_explicitly():
    pins = [l for l in _requirement_lines() if re.match(r"(?i)packaging\s*==", l)]
    assert pins, (
        "backend/requirements.txt must pin packaging explicitly: "
        "gunicorn's gevent worker imports it, but gunicorn declares "
        "it only in its gevent extra (issue #293)."
    )


def test_gunicorn_and_gevent_are_pinned():
    lines = _requirement_lines()
    assert any(re.match(r"(?i)gunicorn\s*==", l) for l in lines)
    assert any(re.match(r"(?i)gevent\s*==", l) for l in lines)


def test_gevent_worker_class_loads():
    # In any environment built from requirements.txt, importing the
    # worker class gunicorn loads for the gevent worker must succeed.
    # This import is what failed in the 1.0.5 image.
    from gunicorn.workers.ggevent import GeventWorker  # noqa: F401
    import packaging  # noqa: F401
