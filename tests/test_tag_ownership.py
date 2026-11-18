"""Warranty tag links are scoped to the requesting user's tags (FILE-03).

A user could link another user's tag to their own warranty by ID,
disclosing the tag's name and color in their warranty payload. The
tag picker only shows own tags, and tag update/delete already enforce
ownership; the warranty create/update link sites now do the same.
"""
import json

import pytest


def _make_tag(client, headers, name):
    r = client.post("/api/tags", headers=headers,
                    json={"name": name, "color": "#112233"})
    assert r.status_code in (200, 201), r.get_data(as_text=True)
    return r.get_json()["id"]


def _make_warranty(client, headers, tag_ids):
    r = client.post("/api/warranties", headers=headers, data={
        "product_name": "Tagged Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "tag_ids": json.dumps(tag_ids),
    })
    assert r.status_code == 201, r.get_data(as_text=True)
    return r.get_json()["id"]


def _warranty_tags(client, headers, warranty_id):
    body = client.get("/api/warranties", headers=headers).get_json()
    items = body.get("warranties", body) if isinstance(body, dict) else body
    w = next(w for w in items if w["id"] == warranty_id)
    return w["tags"]


@pytest.fixture()
def two_users(client, user_factory):
    a = user_factory()
    b = user_factory()
    return a["headers"], b["headers"]


def test_create_cannot_link_another_users_tag(client, two_users):
    headers_a, headers_b = two_users
    foreign_tag = _make_tag(client, headers_a, "owners-secret-tag")
    wid = _make_warranty(client, headers_b, [foreign_tag])
    assert _warranty_tags(client, headers_b, wid) == []


def test_create_links_own_tag(client, two_users):
    _, headers_b = two_users
    own_tag = _make_tag(client, headers_b, "mine")
    wid = _make_warranty(client, headers_b, [own_tag])
    tags = _warranty_tags(client, headers_b, wid)
    assert [t["id"] for t in tags] == [own_tag]


def test_update_cannot_link_another_users_tag(client, two_users):
    headers_a, headers_b = two_users
    foreign_tag = _make_tag(client, headers_a, "owners-secret-tag")
    own_tag = _make_tag(client, headers_b, "mine")
    wid = _make_warranty(client, headers_b, [own_tag])
    assert [t["id"] for t in _warranty_tags(client, headers_b, wid)] == [own_tag]

    r = client.put(f"/api/warranties/{wid}", headers=headers_b, data={
        "product_name": "Tagged Widget",
        "purchase_date": "2025-01-01",
        "exact_expiration_date": "2027-01-01",
        "tag_ids": json.dumps([foreign_tag]),
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _warranty_tags(client, headers_b, wid) == []


def test_foreign_tag_untouched(client, two_users):
    headers_a, headers_b = two_users
    foreign_tag = _make_tag(client, headers_a, "owners-secret-tag")
    _make_warranty(client, headers_b, [foreign_tag])
    tags = client.get("/api/tags", headers=headers_a).get_json()
    tag_list = tags.get("tags", tags) if isinstance(tags, dict) else tags
    assert any(t["id"] == foreign_tag for t in tag_list)
