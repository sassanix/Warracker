"""Conservative in-memory rate limiting for the auth surface (AUTH-05).

Two narrow limiters, both best effort and per worker (the app runs
two gunicorn workers, so a distributed attacker gets twice the
budget; the thresholds below are set with that in mind):

- Login failures: 10 failures for one (client IP, username) pair in
  5 minutes, then 429 for the rest of the window. A success clears
  the pair's failures, so a legitimate user who mistypes a few times
  is never locked out by old attempts.
- Password reset requests: 5 requests for one email address in one
  hour. A limited request is answered with the same generic 200 as
  an unknown address, and no token is minted and no mail is sent, so
  the endpoint cannot be used as an unauthenticated mail relay and
  the limit itself does not reveal whether the address is registered.

Registration is deliberately not limited here: the first-user race
(AUTH-07) is fixed with a database lock instead, and a registration
cap would break legitimate bulk onboarding.
"""
import threading
import time

LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW_SECONDS = 300
RESET_MAX_REQUESTS = 5
RESET_WINDOW_SECONDS = 3600


class _AttemptTracker:
    """Thread-safe per-key timestamp lists with window pruning."""

    def __init__(self):
        self._lock = threading.Lock()
        self._attempts = {}

    def _prune(self, key, window):
        cutoff = time.monotonic() - window
        stamps = [t for t in self._attempts.get(key, []) if t > cutoff]
        if stamps:
            self._attempts[key] = stamps
        else:
            self._attempts.pop(key, None)
        return stamps

    def record(self, key):
        with self._lock:
            self._attempts.setdefault(key, []).append(time.monotonic())

    def count(self, key, window):
        with self._lock:
            return len(self._prune(key, window))

    def is_limited(self, key, limit, window):
        return self.count(key, window) >= limit

    def clear(self, key):
        with self._lock:
            self._attempts.pop(key, None)


_login_tracker = _AttemptTracker()
_reset_tracker = _AttemptTracker()


def _login_key(ip_address, username):
    return (ip_address or "", (username or "").lower())


def login_limited(ip_address, username):
    return _login_tracker.is_limited(
        _login_key(ip_address, username),
        LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS)


def record_login_failure(ip_address, username):
    _login_tracker.record(_login_key(ip_address, username))


def clear_login_failures(ip_address, username):
    _login_tracker.clear(_login_key(ip_address, username))


def reset_request_limited(email):
    return _reset_tracker.is_limited(
        (email or "").lower(), RESET_MAX_REQUESTS, RESET_WINDOW_SECONDS)


def record_reset_request(email):
    _reset_tracker.record((email or "").lower())
