# syntax=docker/dockerfile:1.19.0@sha256:b6afd42430b15f2d2a4c5a02b919e98a525b785b1aaff16747d2f623364e39b6

# renovate: datasource=deb depName=build-essential
ARG BUILD_ESSENTIAL_VERSION=12.12
# renovate: datasource=deb depName=libpq-dev
ARG LIBPQ_DEV_VERSION=17.6-0+deb13u1
# renovate: datasource=deb depName=libcurl4-openssl-dev
ARG LIBCURL4_OPENSSL_DEV_VERSION=8.14.1-2
# renovate: datasource=deb depName=libssl-dev
ARG LIBSSL_DEV_VERSION=3.5.1-1+deb13u1
# renovate: datasource=deb depName=pkg-config
ARG PKG_CONFIG_VERSION=1.8.1-4
# renovate: datasource=deb depName=nginx
ARG NGINX_VERSION=1.26.3-3+deb13u1
# renovate: datasource=deb depName=supervisor
ARG SUPERVISOR_VERSION=4.2.5-3
# renovate: datasource=deb depName=postgresql-client
ARG POSTGRESQL_CLIENT_VERSION=17+278
# renovate: datasource=deb depName=gettext-base
ARG GETTEXT_BASE_VERSION=0.23.1-2
# renovate: datasource=deb depName=curl
ARG CURL_VERSION=8.14.1-2
# renovate: datasource=deb depName=ca-certificates
ARG CA_CERTIFICATES_VERSION=20250419
# renovate: datasource=deb depName=libpq5
ARG LIBPQ5_VERSION=17.6-0+deb13u1
# renovate: datasource=deb depName=libssl3t64
ARG LIBSSL3T64_VERSION=3.5.1-1+deb13u1

FROM python:3.13-slim-trixie@sha256:079601253d5d25ae095110937ea8cfd7403917b53b077870bccd8b026dc7c42f AS builder

ARG BUILD_ESSENTIAL_VERSION
ARG LIBPQ_DEV_VERSION
ARG LIBCURL4_OPENSSL_DEV_VERSION
ARG LIBSSL_DEV_VERSION
ARG PKG_CONFIG_VERSION

# Install build tools (only in builder stage)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential=${BUILD_ESSENTIAL_VERSION} \
        libpq-dev=${LIBPQ_DEV_VERSION} \
        libcurl4-openssl-dev=${LIBCURL4_OPENSSL_DEV_VERSION} \
        libssl-dev=${LIBSSL_DEV_VERSION} \
        pkg-config=${PKG_CONFIG_VERSION} && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install Python dependencies (system-wide installation)
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt


FROM python:3.13-slim-trixie@sha256:079601253d5d25ae095110937ea8cfd7403917b53b077870bccd8b026dc7c42f AS runtime

ARG NGINX_VERSION
ARG SUPERVISOR_VERSION
ARG POSTGRESQL_CLIENT_VERSION
ARG GETTEXT_BASE_VERSION
ARG CURL_VERSION
ARG CA_CERTIFICATES_VERSION
ARG LIBPQ5_VERSION
ARG LIBCURL4_OPENSSL_DEV_VERSION
ARG LIBSSL3T64_VERSION

# Metadata for final image
LABEL org.opencontainers.image.source="https://github.com/sassanix/Warracker"
LABEL org.opencontainers.image.description="Warracker - Warranty Tracker"

# Install runtime dependencies only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx=${NGINX_VERSION} \
        supervisor=${SUPERVISOR_VERSION} \
        postgresql-client=${POSTGRESQL_CLIENT_VERSION} \
        gettext-base=${GETTEXT_BASE_VERSION} \
        curl=${CURL_VERSION} \
        ca-certificates=${CA_CERTIFICATES_VERSION} \
        libpq5=${LIBPQ5_VERSION} \
        libcurl4=${LIBCURL4_OPENSSL_DEV_VERSION} \
        libssl3t64=${LIBSSL3T64_VERSION} && \
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

# 4. Frontend (bundled in one instruction)
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
