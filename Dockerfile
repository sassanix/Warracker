# syntax=docker/dockerfile:1.24.0@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM python:3.13-slim-trixie@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285 AS builder

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

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install Python dependencies (system-wide installation)
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt


FROM python:3.13-slim-trixie@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285 AS runtime

# Metadata for final image
LABEL org.opencontainers.image.source="https://github.com/sassanix/Warracker"
LABEL org.opencontainers.image.description="Warracker - Warranty Tracker"

# Install runtime dependencies only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        postgresql-client \
        gettext-base \
        curl \
        ca-certificates \
        libpq5 \
        libcurl4t64 \
        libssl3t64 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user with home directory
RUN groupadd -r -g 999 warracker && \
    useradd -r -g warracker -u 999 -d /home/warracker -m -s /bin/bash warracker

# Copy Python dependencies from builder (copy entire /usr/local for version-agnostic)
COPY --from=builder /usr/local /usr/local

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

# Optimized health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost/api/health 2>/dev/null || curl -f http://localhost/ || exit 1

# Exposed port
EXPOSE 80

# Entry point and command
# ENTRYPOINT runs setup tasks then executes supervisor
# Supervisor needs to run as root to manage services with different users
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
