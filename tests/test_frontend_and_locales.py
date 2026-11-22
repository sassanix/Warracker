"""Frontend JS syntax, pure utility behavior, locale integrity, and version pins.

Fast static and Node.js checks that protect day-to-day frontend and i18n work:
- Every JS file under frontend/ (excluding vendored libs) and every inline
  <script> block in frontend/*.html must parse cleanly with `node --check`.
- Pure frontend date and currency helpers behave consistently (formatting,
  duration calculation across year/month boundaries, currency positioning and
  thousands grouping).
- All locale translation.json files are valid UTF-8 JSON, contain every key
  present in English (locales/en/translation.json), and stay in sync with
  backend/localization.py SUPPORTED_LANGUAGES.
- Hardcoded frontend version strings in about.html and version-checker.js stay
  in lockstep.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from backend.localization import SUPPORTED_LANGUAGES

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "frontend"
LOCALES = REPO / "locales"


def _flatten_keys(obj, prefix=""):
    keys = set()
    for key, value in obj.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            keys |= _flatten_keys(value, full)
        else:
            keys.add(full)
    return keys


def test_all_frontend_js_files_parse_cleanly():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")

    js_files = sorted(
        p for p in FRONTEND.rglob("*.js")
        if "vendor" not in p.parts
    )
    assert js_files, "no frontend JS files found"

    failures = []
    for js_file in js_files:
        r = subprocess.run(
            [node, "--check", str(js_file)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            failures.append(f"{js_file.relative_to(REPO)}: {r.stderr.strip()}")
    assert not failures, "\n".join(failures)


def test_all_inline_html_scripts_parse_cleanly():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")

    html_files = sorted(FRONTEND.glob("*.html"))
    assert html_files, "no frontend HTML files found"

    failures = []
    for html_file in html_files:
        src = html_file.read_text(encoding="utf-8")
        for idx, match in enumerate(
            re.finditer(r"<script\b([^>]*)>(.*?)</script>", src, re.S | re.I)
        ):
            attrs, body = match.group(1), match.group(2)
            if re.search(r"\bsrc\s*=", attrs, re.I) or not body.strip():
                continue
            is_module = bool(re.search(r'type\s*=\s*["\']module["\']', attrs, re.I))
            suffix = ".mjs" if is_module else ".js"
            with tempfile.NamedTemporaryFile(
                "w", suffix=suffix, delete=False, encoding="utf-8"
            ) as tf:
                tf.write(body)
                tmp_path = tf.name
            try:
                r = subprocess.run(
                    [node, "--check", tmp_path],
                    capture_output=True, text=True,
                )
                if r.returncode != 0:
                    failures.append(
                        f"{html_file.relative_to(REPO)} inline script #{idx}: {r.stderr.strip()}"
                    )
            finally:
                os.unlink(tmp_path)

    assert not failures, "\n".join(failures)


def test_frontend_dates_and_currency_helpers_behavior():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")

    dates_url = (FRONTEND / "js" / "lib" / "dates.js").as_uri()
    currency_url = (FRONTEND / "js" / "lib" / "currency.js").as_uri()

    script = f"""
    globalThis.window = {{ location: {{ origin: 'http://localhost', pathname: '/' }} }};
    globalThis.document = {{ addEventListener: () => {{}} }};
    globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
    const dates = await import({json.dumps(dates_url)});
    const currency = await import({json.dumps(currency_url)});

    function eq(actual, expected, label) {{
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {{
        throw new Error(`${{label}}: expected ${{JSON.stringify(expected)}}, got ${{JSON.stringify(actual)}}`);
      }}
    }}

    // dates.js
    eq(dates.formatDate('2025-03-15T00:00:00Z'), 'Mar 15, 2025', 'formatDate ISO');
    eq(dates.formatDate(''), 'Unknown', 'formatDate empty');
    eq(dates.formatDate('not-a-date'), 'Unknown', 'formatDate invalid');
    eq(dates.formatDateYYYYMMDD(new Date(Date.UTC(2025, 0, 5))), '2025-01-05', 'formatDateYYYYMMDD');
    eq(dates.formatDateYYYYMMDD(null), 'N/A', 'formatDateYYYYMMDD null');
    eq(
      dates.calculateDurationFromDates('2024-01-15', '2026-03-20'),
      {{ years: 2, months: 2, days: 5 }},
      'calculateDurationFromDates simple'
    );
    eq(
      dates.calculateDurationFromDates('2024-03-31', '2025-02-28'),
      {{ years: 0, months: 10, days: 28 }},
      'calculateDurationFromDates borrow across year'
    );

    // currency.js
    const expectedLeft = (1234.5).toLocaleString(undefined, {{
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }});
    const expectedRight = (182591).toLocaleString(undefined, {{
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }});
    eq(
      currency.formatCurrencyHTML(1234.5, '$', 'left'),
      `<span class="currency-symbol">$</span><span>${{expectedLeft}}</span>`,
      'formatCurrencyHTML left'
    );
    eq(
      currency.formatCurrencyHTML(182591, 'дин', 'right'),
      `<span>${{expectedRight}}</span><span class="currency-symbol currency-right">дин</span>`,
      'formatCurrencyHTML right'
    );
    eq(currency.getCurrencySymbolByCode('USD'), '$', 'USD symbol');
    eq(currency.getCurrencySymbolByCode('EUR'), '€', 'EUR symbol');
    eq(currency.getCurrencySymbolByCode('RSD'), 'дин', 'RSD symbol');
    """
    r = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr


def test_locales_are_valid_json_complete_and_match_supported_languages():
    en_path = LOCALES / "en" / "translation.json"
    en_data = json.loads(en_path.read_text(encoding="utf-8"))
    en_keys = _flatten_keys(en_data)
    assert en_keys, "English translation file has no keys"

    locale_dirs = sorted(
        p.name for p in LOCALES.iterdir()
        if p.is_dir() and (p / "translation.json").is_file()
    )
    assert set(locale_dirs) == set(SUPPORTED_LANGUAGES), (
        f"locales/ dirs {sorted(locale_dirs)} != SUPPORTED_LANGUAGES {sorted(SUPPORTED_LANGUAGES)}"
    )

    missing_by_locale = {}
    for lang in locale_dirs:
        data = json.loads((LOCALES / lang / "translation.json").read_text(encoding="utf-8"))
        keys = _flatten_keys(data)
        missing = sorted(en_keys - keys)
        if missing:
            missing_by_locale[lang] = missing[:10]
    assert not missing_by_locale, f"Missing translation keys: {missing_by_locale}"


def test_frontend_version_strings_stay_in_sync():
    about = (FRONTEND / "about.html").read_text(encoding="utf-8")
    checker = (FRONTEND / "version-checker.js").read_text(encoding="utf-8")

    m_badge = re.search(r'id="versionDisplay"[^>]*>Version v([0-9]+\.[0-9]+\.[0-9]+)<', about)
    m_about_js = re.search(r"const currentVersion = '([0-9]+\.[0-9]+\.[0-9]+)';", about)
    m_checker = re.search(r"const currentVersion = '([0-9]+\.[0-9]+\.[0-9]+)';", checker)

    assert m_badge, "could not find About page version badge"
    assert m_about_js, "could not find About page currentVersion constant"
    assert m_checker, "could not find version-checker.js currentVersion constant"
    assert m_badge.group(1) == m_about_js.group(1) == m_checker.group(1)
