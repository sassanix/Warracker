"""MISC-01: every file the service worker precaches must exist.

Two precache entries pointed at files that do not exist, and the
atomic cache.addAll install rolled back the whole batch, leaving
offline caching silently empty on plain static hosting. The install
now caches per URL so one failure cannot void the rest, and this pin
fails the suite if a precache entry ever goes stale again.
"""
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend")


def _precache_urls():
    with open(os.path.join(FRONTEND_DIR, "sw.js"), encoding="utf-8") as fh:
        src = fh.read()
    block = src.split("urlsToCache")[1].split("];")[0]
    return re.findall(r"'(\./[^']+)'", block), src


def test_every_precache_entry_exists_on_disk():
    urls, _ = _precache_urls()
    assert urls, "no precache entries parsed from sw.js"
    missing = []
    for url in urls:
        path = url[2:].split("?")[0]
        if not path:
            continue
        if not os.path.isfile(os.path.join(FRONTEND_DIR, path)):
            missing.append(url)
    assert missing == []


def test_install_caches_per_url_not_atomically():
    _, src = _precache_urls()
    assert "cache.addAll(urlsToCache)" not in src
    assert "cache.add(url)" in src
