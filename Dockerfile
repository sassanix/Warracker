# syntax=docker/dockerfile:1.28.0@sha256:bb22d9815c728170f72750f4e5b0d672e06176142e1d602c7e66c050100b7e5b

FROM python:3.15-slim-trixie@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928 AS builder

# Install build tools (only in builder stage)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        libcurl4-openssl-dev \
        libssl-dev \
        pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Python dependencies into a virtualenv. The runtime stage copies
# only the venv, so the image does not carry a second copy of the Python
# interpreter and standard library from the builder's /usr/local.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --no-compile -r /tmp/requirements.txt

# Strip what the runtime never uses: bytecode caches (the app runs with
# PYTHONDONTWRITEBYTECODE=1), the packages' own test suites, and pip itself.
RUN find /opt/venv -type d -name "__pycache__" -prune -exec rm -rf {} + && \
    find /opt/venv -type d \( -name "tests" -o -name "test" \) -prune -exec rm -rf {} + && \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/bin/pip*


FROM python:3.15-slim-trixie@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928 AS runtime

# Metadata for final image
LABEL org.opencontainers.image.source="https://github.com/sassanix/Warracker"
LABEL org.opencontainers.image.description="Warracker - Warranty Tracker"

# Create the non-root user before installing packages. Runtime packages pull in
# systemd, and its systemd-journal group takes the first free system GID (999)
# on Debian Trixie. Upload volumes are owned by uid/gid 999, so warracker must
# claim that ID first.
RUN groupadd -r -g 999 warracker && \
    useradd -r -g warracker -u 999 -d /home/warracker -m -s /bin/bash warracker

# Install runtime dependencies only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        logrotate \
        cron \
        gettext-base \
        curl \
        ca-certificates \
        libpq5 \
        libcurl4t64 \
        libssl3t64 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy the Python virtualenv from the builder (supervisord, gunicorn and
# pybabel all run from it; supervisor is now the pip package, so the runtime
# no longer needs Debian's supervisor package and its system Python)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Configure directories with proper permissions
RUN mkdir -p /app /var/www/html /var/log/supervisor /run/nginx && \
    chown -R warracker:warracker /app /var/www/html /var/log/supervisor /run/nginx /home/warracker && \
    chown -R warracker:warracker /var/log/nginx

# Set working directory
WORKDIR /app

# 1. Configuration and static files first (rarely change)
COPY --chown=warracker:warracker nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --chown=warracker:warracker babel.cfg ./

# 2. Migration scripts and utilities
COPY --chown=warracker:warracker backend/fix_permissions.py backend/fix_permissions.sql ./
COPY --chown=warracker:warracker backend/migrations/ ./migrations/

# 3. Localization files
COPY --chown=warracker:warracker locales/ ./locales/
COPY --chown=warracker:warracker locales/ /var/www/html/locales/

# 4. Frontend (static files, no build step)
COPY --chown=warracker:warracker frontend/ /var/www/html/

# 5. Backend (bundled in one instruction)
COPY --chown=warracker:warracker backend/ ./backend/
COPY --chown=warracker:warracker backend/app.py backend/gunicorn_config.py ./


# Copy configuration files and scripts from Docker directory
COPY --chown=root:root Docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=root:root Docker/logrotate-nginx /etc/logrotate.d/nginx-warracker
COPY --chown=warracker:warracker Docker/entrypoint.sh /app/entrypoint.sh
COPY --chown=root:root Docker/nginx-wrapper.sh /app/nginx-wrapper.sh

# Make scripts executable
RUN chmod +x /app/entrypoint.sh /app/nginx-wrapper.sh


# Additional environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NGINX_MAX_BODY_SIZE_VALUE=32M

# Clean default nginx site
RUN rm -f /etc/nginx/sites-enabled/default

# Optimized health check - hits the backend's /api/health (which verifies DB
# connectivity) so a frozen backend is detected instead of the container
# reporting healthy via nginx alone (see issue #239).
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost/api/health || exit 1

# Exposed port
EXPOSE 80

# Entry point and command
# ENTRYPOINT runs setup tasks then executes supervisor
# Supervisor needs to run as root to manage services with different users
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/opt/venv/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
