"""OIDC userinfo claims must describe the authenticated subject (AUTH-11).

The callback falls back to the userinfo endpoint for email, names, and
groups. If the userinfo subject differs from the ID token subject, the
claims belong to a different user and the login must be refused.
"""
from backend.oidc_handler import _userinfo_subject_matches


def test_matching_subjects_agree():
    assert _userinfo_subject_matches(
        {"sub": "user-1", "iss": "https://idp.test"},
        {"sub": "user-1", "email": "a@test.local", "groups": ["admins"]},
    ) is True


def test_divergent_userinfo_subject_rejected():
    # The audit's mock provider: an admin group and a different subject
    # carried only by userinfo, with a group-free ID token.
    assert _userinfo_subject_matches(
        {"sub": "user-1", "iss": "https://idp.test"},
        {"sub": "user-2", "email": "a@test.local", "groups": ["admins"]},
    ) is False


def test_missing_userinfo_subject_tolerated():
    assert _userinfo_subject_matches(
        {"sub": "user-1", "iss": "https://idp.test"},
        {"email": "a@test.local"},
    ) is True


def test_missing_id_token_subject_never_matches_a_userinfo_subject():
    assert _userinfo_subject_matches(
        {"iss": "https://idp.test"},
        {"sub": "user-1"},
    ) is False
