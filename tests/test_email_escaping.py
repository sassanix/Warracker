"""EMAIL-01: notification emails must escape the recipient's first
name and product names in the HTML part.

The audit verified live markup in a real captured email produced by
the app's own sending path. The plain text part keeps the raw
values; only the HTML part is escaped.
"""
from backend.notifications import format_expiration_email


def _build_email(monkeypatch, first_name, product_name):
    monkeypatch.setenv('APP_BASE_URL', 'http://warracker.example')
    user = {
        'first_name': first_name,
        'email': 'owner@example.com',
    }
    warranties = [{
        'product_name': product_name,
        'expiration_date': '2026-12-01',
    }]
    msg = format_expiration_email(user, warranties, None, None)
    parts = {part.get_content_type(): part.get_payload(decode=True).decode()
             for part in msg.get_payload()}
    return parts['text/plain'], parts['text/html']


def test_first_name_and_product_name_escaped_in_html_part(monkeypatch):
    _, html_body = _build_email(
        monkeypatch,
        '<b>Mal</b>',
        '<img src=x onerror=alert(1)>',
    )
    assert '<b>Mal</b>' not in html_body
    assert '&lt;b&gt;Mal&lt;/b&gt;' in html_body
    assert '<img src=x onerror=alert(1)>' not in html_body
    assert '&lt;img src=x onerror=alert(1)&gt;' in html_body


def test_plain_text_part_keeps_raw_values(monkeypatch):
    text_body, _ = _build_email(
        monkeypatch, '<b>Mal</b>', 'Acme <Widget>')
    assert 'Hello <b>Mal</b>,' in text_body
    assert '- Acme <Widget> (expires on 2026-12-01)' in text_body


def test_quotes_escaped_in_greeting_and_product(monkeypatch):
    _, html_body = _build_email(
        monkeypatch,
        'Ann "Annie"',
        "Mom's Laptop",
    )
    assert 'Ann &quot;Annie&quot;' in html_body
    assert 'Mom&#x27;s Laptop' in html_body
