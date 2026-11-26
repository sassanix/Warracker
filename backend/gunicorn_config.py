#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Gunicorn configuration file for Warracker application.
Optimized for memory efficiency with configurable modes.
"""

import os

# Mark this process tree as running under gunicorn, before the app
# loads. The notification scheduler must start exactly once, in the
# master from when_ready (#299), so create_app checks this flag and
# does not start it. It cannot be set in on_starting: under
# preload_app the app loads in Arbiter.__init__, before start() calls
# on_starting. Workers inherit the flag through the fork, and tell
# themselves apart with GUNICORN_WORKER_ID (set in post_fork).
os.environ["WARRACKER_GUNICORN_MASTER"] = "1"

# CRITICAL: Apply gevent monkey patching VERY EARLY to prevent SSL RecursionError
# This must happen before any other imports that might use SSL
memory_mode = os.environ.get('WARRACKER_MEMORY_MODE', 'optimized').lower()

# Only apply monkey patching for modes that will use gevent workers
if memory_mode in ('optimized', 'performance'):
    try:
        from gevent import monkey
        monkey.patch_all()
        print("✅ Early gevent monkey patch applied for SSL compatibility.")
    except ImportError:
        print("⚠️ Gevent not found, but gevent workers will be requested. This may cause issues.")
    # Make psycopg2 cooperate with the gevent hub so a blocked socket read
    # yields to the event loop instead of freezing the worker (see issue #239)
    try:
        from psycogreen.gevent import patch_psycopg
        patch_psycopg()
        print("✅ psycogreen gevent patch applied for psycopg2.")
    except ImportError:
        print("⚠️ psycogreen not installed; psycopg2 will block gevent workers on slow queries.")

import multiprocessing

# Server configurations - Dynamic based on memory mode
bind = "0.0.0.0:5000"


def _resolve_forwarded_allow_ips():
    """Limit which peers Gunicorn trusts for X-Forwarded-* headers (H-03).

    In the default container, bundled Nginx connects over loopback so only
    127.0.0.1/::1 should be trusted. When DISABLE_NGINX=true, allow loopback
    and private LAN/Docker proxy CIDRs matching backend._forwarded_headers_trusted.
    Operators can override via GUNICORN_FORWARDED_ALLOW_IPS or TRUST_PROXY_HEADERS.
    """
    explicit = os.environ.get('GUNICORN_FORWARDED_ALLOW_IPS', '').strip()
    if explicit:
        return explicit
    trust_override = os.environ.get('TRUST_PROXY_HEADERS', '').strip().lower()
    if trust_override == 'true':
        return '*'
    if trust_override == 'false':
        return ''
    if os.environ.get('DISABLE_NGINX', 'false').strip().lower() == 'true':
        return '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10'
    return '127.0.0.1,::1'


forwarded_allow_ips = _resolve_forwarded_allow_ips()

# Determine worker class first, then apply appropriate monkey patching
if memory_mode == 'ultra-light':
    # Ultra-lightweight configuration for very memory-constrained environments
    workers = 1  # Single worker for minimal memory usage (~40-50MB total)
    worker_class = "sync"  # Sync worker for lowest memory overhead
    worker_connections = 50  # Reduced connections
    max_requests = 500  # More frequent worker restarts to prevent memory leaks
    worker_rlimit_as = 67108864  # 64MB per worker limit
    print("Using ULTRA-LIGHT memory mode - minimal RAM usage, lower concurrency")
elif memory_mode == 'performance':
    # High-performance configuration for servers with plenty of RAM
    workers = 4  # Original worker count for maximum concurrency
    worker_class = "gevent"  # Efficient async I/O handling
    worker_connections = 200  # Higher connection limit per worker
    max_requests = 2000  # Less frequent restarts for better performance
    worker_rlimit_as = 268435456  # 256MB per worker limit
    print("Using PERFORMANCE memory mode - maximum concurrency and performance")
else:
    # Default optimized configuration for balanced performance and memory usage
    workers = 2  # Reduced from 4 to save ~75MB RAM
    worker_class = "gevent"  # More memory efficient than sync workers
    worker_connections = 100  # Limit concurrent connections per worker
    max_requests = 1000  # Restart workers after handling requests to prevent memory leaks
    worker_rlimit_as = 134217728  # 128MB per worker limit
    print("Using OPTIMIZED memory mode - balanced RAM usage and performance")

# Export worker_class and master PID before when_ready so the master's
# scheduler selects GeventScheduler when gevent monkey-patching is active
# (avoiding BackgroundScheduler threading._active KeyErrors in forked
# workers) and workers can read the master's live scheduler status (#299).
os.environ["GUNICORN_WORKER_CLASS"] = worker_class
os.environ["WARRACKER_GUNICORN_MASTER_PID"] = str(os.getpid())

# Note: Gevent monkey patching was applied early at top of file for SSL compatibility
if worker_class == "gevent":
    print(f"ℹ️ Using gevent workers with early monkey patching applied.")
else:
    print(f"ℹ️ Using {worker_class} workers - no monkey patching needed.")

# Common settings for both modes
timeout = 120
keepalive = 5
max_requests_jitter = 50  # Add randomness to prevent thundering herd

# Enhanced settings for file handling to prevent Content-Length mismatches
limit_request_line = 8190  # Increase request line limit
limit_request_fields = 200  # Increase header fields limit
limit_request_field_size = 8190  # Increase header field size limit

# Memory management (common to both modes)
preload_app = True  # Share memory between workers (saves RAM)
worker_tmp_dir = "/dev/shm"  # Use RAM disk for worker temporary files

# Process management callbacks
def worker_int(worker):
    """Called just after a worker exited on SIGINT or SIGQUIT."""
    print(f"Worker {worker.pid} received SIGINT/SIGQUIT")

def worker_abort(worker):
    """Called when a worker receives the SIGABRT signal."""
    print(f"Worker {worker.pid} received SIGABRT")

def worker_exit(server, worker):
    """Called just after a worker has been exited."""
    print(f"Worker {worker.pid} exited")

def on_starting(server):
    """Called just before the master process is initialized."""
    print("Server is starting with memory-optimized configuration")

def when_ready(server):
    """Called in the master once the arbiter is ready, before workers spawn.

    Start the single notification scheduler here (#299). create_app
    does not start it under gunicorn, and workers discard the copy
    they inherit in post_fork, so exactly one scheduler runs.
    """
    try:
        try:
            from backend.notifications import init_scheduler
            from backend.db_handler import get_db_connection, release_db_connection
        except ImportError:
            from notifications import init_scheduler
            from db_handler import get_db_connection, release_db_connection
        app = server.app.wsgi()
        if init_scheduler(app, get_db_connection, release_db_connection, force=True):
            print("Notification scheduler started in the gunicorn master")
        else:
            print("Warning: notification scheduler did not start in the gunicorn master")
    except Exception as e:
        print(f"Warning: failed to start notification scheduler in the gunicorn master: {e}")

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    os.environ["GUNICORN_WORKER_ID"] = str(worker.age - 1)
    os.environ["GUNICORN_WORKER_PROCESS_NAME"] = f"worker-{worker.age - 1}"
    os.environ["GUNICORN_WORKER_CLASS"] = worker_class

    # Discard the scheduler inherited from the master (#299): the
    # master owns the single scheduler, and a forked copy would send
    # duplicate notifications. This runs before the worker starts
    # serving, so the inherited scheduler never fires here.
    try:
        try:
            from backend.notifications import discard_inherited_scheduler
        except ImportError:
            from notifications import discard_inherited_scheduler
        discard_inherited_scheduler()
    except Exception as e:
        print(f"Warning: could not discard inherited scheduler: {e}")

    print(f"Worker {worker.pid} (ID: {worker.age - 1}) forked with memory optimization")

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    print(f"Forking worker #{worker.age}")

print(f"Gunicorn configuration loaded: {workers} {worker_class} workers in {memory_mode.upper()} mode")
print(f"Memory limit per worker: {worker_rlimit_as // 1024 // 1024}MB, Max connections: {worker_connections if 'worker_connections' in locals() else 'N/A'}")

# To switch memory modes, set WARRACKER_MEMORY_MODE environment variable:
# - "optimized" (default): 2 gevent workers, balanced performance and memory usage (~60-80MB)
# - "ultra-light": 1 sync worker, minimal memory usage (~40-50MB, lower concurrency)
# - "performance": 4 gevent workers, high-performance mode (~200MB) 