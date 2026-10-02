#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Gunicorn configuration file for Warracker application.
Optimized for memory efficiency with configurable modes.
"""

import os

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
forwarded_allow_ips = '*'  # Trust proxy headers from any source (safe in containerized environment)

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

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    os.environ["GUNICORN_WORKER_ID"] = str(worker.age - 1)
    os.environ["GUNICORN_WORKER_PROCESS_NAME"] = f"worker-{worker.age - 1}"
    os.environ["GUNICORN_WORKER_CLASS"] = worker_class
    
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