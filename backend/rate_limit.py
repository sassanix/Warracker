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
from collections import OrderedDict
import threading
import time

LOGIN_MAX_FAILURES = 10
LOGIN_IP_MAX_FAILURES = 100
LOGIN_WINDOW_SECONDS = 300
RESET_MAX_REQUESTS = 5
RESET_WINDOW_SECONDS = 3600
MAX_TRACKED_KEYS = 10000


class _AttemptTracker:
    """Thread-safe per-key timestamp lists with bounded memory and window pruning."""

    def __init__(self, max_keys=MAX_TRACKED_KEYS, default_window=RESET_WINDOW_SECONDS):
        self._lock = threading.Lock()
        self._attempts = OrderedDict()
        self._max_keys = max_keys
        self._default_window = default_window
        self._writes_since_sweep = 0

    def _prune(self, key, window):
        cutoff = time.monotonic() - window
        stamps = [t for t in self._attempts.get(key, []) if t > cutoff]
        if stamps:
            self._attempts[key] = stamps
            self._attempts.move_to_end(key)
        else:
            self._attempts.pop(key, None)
        return stamps

    def _sweep_expired(self, window):
        cutoff = time.monotonic() - window
        expired_keys = [
            k for k, stamps in self._attempts.items()
            if not stamps or stamps[-1] <= cutoff
        ]
        for k in expired_keys:
            self._attempts.pop(k, None)

    def record(self, key, window=None):
        now = time.monotonic()
        effective_window = window if window is not None else self._default_window
        with self._lock:
            self._writes_since_sweep += 1
            if self._writes_since_sweep >= 256:
                self._sweep_expired(effective_window)
                self._writes_since_sweep = 0

            stamps = self._attempts.get(key)
            if stamps is None:
                if len(self._attempts) >= self._max_keys:
                    self._sweep_expired(effective_window)
                    while len(self._attempts) >= self._max_keys:
                        self._attempts.popitem(last=False)
                self._attempts[key] = [now]
            else:
                cutoff = now - effective_window
                stamps = [t for t in stamps if t > cutoff]
                stamps.append(now)
                self._attempts[key] = stamps
                self._attempts.move_to_end(key)

    def count(self, key, window):
        with self._lock:
            return len(self._prune(key, window))

    def is_limited(self, key, limit, window):
        return self.count(key, window) >= limit

    def clear(self, key):
        with self._lock:
            self._attempts.pop(key, None)


_login_tracker = _AttemptTracker(default_window=LOGIN_WINDOW_SECONDS)
_login_ip_tracker = _AttemptTracker(default_window=LOGIN_WINDOW_SECONDS)
_reset_tracker = _AttemptTracker(default_window=RESET_WINDOW_SECONDS)


def _login_key(ip_address, username):
    return (ip_address or "", (username or "").lower())


def _login_ip_key(ip_address):
    return ip_address or ""


def login_limited(ip_address, username):
    if _login_tracker.is_limited(
        _login_key(ip_address, username),
        LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS,
    ):
        return True
    if ip_address and _login_ip_tracker.is_limited(
        _login_ip_key(ip_address),
        LOGIN_IP_MAX_FAILURES, LOGIN_WINDOW_SECONDS,
    ):
        return True
    return False


def record_login_failure(ip_address, username):
    _login_tracker.record(_login_key(ip_address, username), LOGIN_WINDOW_SECONDS)
    if ip_address:
        _login_ip_tracker.record(_login_ip_key(ip_address), LOGIN_WINDOW_SECONDS)


def clear_login_failures(ip_address, username):
    _login_tracker.clear(_login_key(ip_address, username))


def reset_request_limited(email):
    return _reset_tracker.is_limited(
        (email or "").lower(), RESET_MAX_REQUESTS, RESET_WINDOW_SECONDS)


def record_reset_request(email):
    _reset_tracker.record((email or "").lower(), RESET_WINDOW_SECONDS)
