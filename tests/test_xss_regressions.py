"""Regression pins for the 1.0.5 stored-XSS fixes (audit XSS-01/02/04A).

The vulnerable sinks are frontend rendering paths, so these tests pin
the safe rendering patterns in the shipped sources: if anyone puts the
raw interpolation back, the suite fails before the payload does.

- XSS-01: the admin Users table rendered `user.username` through
  innerHTML. A crafted username executed in an admin's browser as soon
  as Settings loaded. The username must be assigned via textContent,
  with the owner crown built as a DOM node.
- XSS-02: card document links interpolated the stored document URL
  straight into an href attribute, so a quote in the URL broke out of
  the attribute. The URL must go through the renderer's established
  escapeHtml(sanitizeUrl(...)) path, like the product link already did.
- XSS-04A: the legacy edit modal (the only edit modal on the status
  page) interpolated serial numbers into an input's value attribute.
  Serials must be assigned through the input's value property. Note
  script.js's global escapeHtml is shadowed by a quote-less variant,
  so escaping alone is not sufficient protection in attribute context.
"""
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _read(relpath):
    with open(os.path.join(REPO_ROOT, relpath), encoding="utf-8") as fh:
        return fh.read()


def test_xss01_username_rendered_as_text_not_innerhtml():
    src = _read("frontend/settings-new.js")
    assert "usernameCell.textContent = user.username" in src
    assert "usernameCell.innerHTML = user.username" not in src
    # Crown preserved, but as a DOM node rather than an HTML string.
    assert "document.createElement('i')" in src
    assert "crownIcon.className = 'fas fa-crown'" in src


def test_xss02_document_url_escaped_and_sanitized():
    src = _read("frontend/js/components/warrantyRenderer.js")
    assert "escapeHtml(sanitizeUrl(config.url))" in src
    assert 'href="${config.url}"' not in src


def test_xss04a_edit_modal_serials_assigned_via_value_property():
    src = _read("frontend/script.js")
    assert 'value="${validSerialNumbers[' not in src
    assert ".value = validSerialNumbers[0]" in src
    assert ".value = validSerialNumbers[i]" in src

