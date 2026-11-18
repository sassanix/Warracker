"""Regression pins for the stored-XSS fixes (audit XSS-01/02/04A/05).

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
  Serials must be assigned through the input's value property. (At the
  time, script.js's global escapeHtml was shadowed by a quote-less
  variant, so escaping alone was not sufficient protection in
  attribute context; the XSS-05 fix made both definitions escape
  quotes, and the value-property assignment stays as defence in depth.)
- XSS-05: tag names and colors were interpolated raw into innerHTML in
  the module tag manager (picker, selected chips, Manage Tags) and the
  legacy tag renders, and script.js's effective escapeHtml did not
  escape quotes, so a quote-bearing tag name broke out of input value
  attributes. Every tag name and color interpolation must go through
  an escapeHtml that escapes quotes.
- XSS-08: the Settings Paperless debug flow rendered the test
  connection message (which relays the upstream HTTP reason phrase),
  the stored Paperless URL, and handler error text raw into innerHTML,
  so a hostile Paperless server's reason phrase executed in the
  owner's browser. The test-connection and test-upload renders carry
  the same server-controlled strings. All of them must go through the
  file's escapeHtmlSafe helper.
- XSS-09: the add-warranty wizard's summary step interpolated the
  user's own unsaved serial numbers raw into innerHTML, so a typed
  payload executed when the summary rendered. The list must be built
  with DOM APIs and textContent.
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


def test_xss05_tag_manager_escapes_names_and_colors():
    src = _read("frontend/js/components/tagManager.js")
    assert "${tag.name}" not in src
    assert "${tag.color}" not in src
    assert "${escapeHtml(tag.name)}" in src
    assert "${escapeHtml(tag.color)}" in src
    # The "Create ..." option interpolates the typed search term.
    assert "${escapeHtml(createText)}" in src
    # The module helper must escape quotes (attribute contexts).
    assert "'\"': '&quot;'" in src


def test_xss05_script_escapehtml_definitions_escape_quotes():
    src = _read("frontend/script.js")
    # Both function declarations must escape quotes: the later one
    # shadows the earlier at every call site.
    parts = src.split("function escapeHtml")
    assert len(parts) == 3, "expected exactly two escapeHtml definitions"
    for body in parts[1:]:
        assert "&quot;" in body[:500]
    # The old quote-less div.textContent implementation must be gone.
    assert "div.textContent = text" not in src


def test_xss05_legacy_tag_sites_escaped():
    src = _read("frontend/script.js")
    assert "${tag.name}" not in src
    assert "${tag.color}" not in src
    assert "${escapeHtml(tag.name)}" in src
    assert "${escapeHtml(tag.color)}" in src


def test_xss08_paperless_debug_render_escaped():
    src = _read("frontend/settings-new.js")
    debug = src[src.index("async function debugPaperlessConfiguration"):src.index("async function testFileUpload")]
    assert "${escapeHtmlSafe(result.paperless_url)" in debug
    assert "${escapeHtmlSafe(result.test_connection_result.message" in debug
    assert "${escapeHtmlSafe(result.paperless_handler_error)}" in debug
    assert "${result.paperless_url" not in debug
    assert "${result.test_connection_result.message" not in debug
    assert "${result.paperless_handler_error}" not in debug


def test_xss08_paperless_test_renders_escaped():
    src = _read("frontend/settings-new.js")
    section = src[src.index("async function testPaperlessConnection"):src.index("async function debugPaperlessConfiguration")]
    assert "${result.message}" not in section
    assert "${result.server_info}" not in section
    # One raw ${error.message} remains, inside a showToast call, which
    # renders via textContent; the innerHTML catch template is escaped.
    assert section.count("${error.message}") == 1
    assert "showToast(`Error testing connection: ${error.message}`" in section
    assert "${escapeHtmlSafe(error.message)}" in section
    assert "${escapeHtmlSafe(result.message)}" in section
    assert "${escapeHtmlSafe(result.server_info)}" in section
    upload = src[src.index("async function testFileUpload"):src.index("function isValidUrl")]
    assert "${result.message}" not in upload
    assert "${result.error}" not in upload
    assert "${result.file_info.filename}" not in upload
    assert "${escapeHtmlSafe(result.message)}" in upload
    assert "${escapeHtmlSafe(result.error)}" in upload


def test_xss09_wizard_summary_serials_built_as_dom_nodes():
    src = _read("frontend/js/components/formTabs.js")
    assert "<li>${sn}</li>" not in src
    assert "serialNumbers.map(sn =>" not in src
    assert "document.createElement('ul')" in src
    assert "document.createElement('li')" in src
    assert "item.textContent = sn" in src
    # The live summary render is addWarrantyForm.js's updateSummary,
    # which carried the same raw interpolation; both copies are pinned.
    live = _read("frontend/js/components/addWarrantyForm.js")
    assert "<li>${sn}</li>" not in live
    assert "serialValues.map((sn) =>" not in live
    assert "document.createElement('ul')" in live
    assert "item.textContent = sn" in live

