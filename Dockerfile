# Start with Python base image
FROM python:3.12-slim-bookworm
LABEL org.opencontainers.image.source="https://github.com/sassanix/Warracker"
# Install build tools, dev headers, nginx, etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        nginx \
        curl \
        postgresql-15 \
        postgresql-client-15 \
        supervisor \
        gettext-base \
        libcurl4-openssl-dev \
        libssl-dev \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
# (build-essential = C compiler + tools)
# (libpq-dev      = provides pg_config for psycopg2)


# Nginx will be started with "daemon off;" via supervisor, so no need to sed the main nginx.conf

WORKDIR /app

# (Optional) Upgrade pip to latest
RUN pip install --no-cache-dir --upgrade pip

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy main application and config files to /app
COPY backend/app.py .
COPY backend/gunicorn_config.py .

# Create the backend package directory in /app and copy modules into it
RUN mkdir -p /app/backend
COPY backend/__init__.py /app/backend/
COPY backend/config.py /app/backend/
COPY backend/auth_utils.py /app/backend/
COPY backend/auth_routes.py /app/backend/
COPY backend/db_handler.py /app/backend/
COPY backend/extensions.py /app/backend/
COPY backend/oidc_handler.py /app/backend/
COPY backend/apprise_handler.py /app/backend/
COPY backend/notifications.py /app/backend/
COPY backend/paperless_handler.py /app/backend/
COPY backend/localization.py /app/backend/
COPY backend/warranties_routes.py /app/backend/
COPY backend/admin_routes.py /app/backend/
COPY backend/statistics_routes.py /app/backend/
COPY backend/tags_routes.py /app/backend/
COPY backend/utils.py /app/backend/
COPY backend/file_routes.py /app/backend/

# Copy other utility scripts and migrations
COPY backend/fix_permissions.py .
COPY backend/fix_permissions.sql .
COPY backend/migrations/ /app/migrations/

# Copy frontend files
COPY frontend/*.html /var/www/html/
COPY frontend/*.js /var/www/html/
COPY frontend/*.css /var/www/html/
COPY frontend/manifest.json /var/www/html/manifest.json
# Add favicon and images
COPY frontend/favicon.ico /var/www/html/
COPY frontend/img/ /var/www/html/img/
# Copy frontend JS directory for localization
COPY frontend/js/ /var/www/html/js/

# Copy localization files
COPY locales/ /app/locales/
COPY locales/ /var/www/html/locales/
COPY babel.cfg /app/

# Configure nginx site
RUN rm /etc/nginx/sites-enabled/default
# Copy nginx.conf as a template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Create startup script with database initialization (SUPERUSER grant removed)
RUN echo '#!/bin/bash\n\
set -e # Exit immediately if a command exits with a non-zero status.\n\
echo "Running database migrations..."\n\
python /app/migrations/apply_migrations.py\n\
echo "Running fix permissions script..."\n\
python /app/fix_permissions.py\n\
echo "Compiling translations..."\n\
cd /app && python -c "import subprocess; subprocess.run([\"pybabel\", \"compile\", \"-d\", \"locales\"], check=False)"\n\
echo "Setup script finished successfully."\n\
# The actual services (gunicorn, nginx) will be started by Supervisor below\n\
exit 0 # Exit successfully, Supervisor takes over\n\
' > /app/start.sh && chmod +x /app/start.sh

# Create a wrapper script for starting Nginx with sed for placeholder replacement
RUN echo '#!/bin/sh' > /app/start_nginx_wrapper.sh && \
    echo 'set -e' >> /app/start_nginx_wrapper.sh && \
    echo '' >> /app/start_nginx_wrapper.sh && \
    echo '# Read the environment variable, which the user sets in docker-compose.yml' >> /app/start_nginx_wrapper.sh && \
    echo 'EFFECTIVE_SIZE="${NGINX_MAX_BODY_SIZE_VALUE}"' >> /app/start_nginx_wrapper.sh && \
    echo '' >> /app/start_nginx_wrapper.sh && \
    echo '# Validate EFFECTIVE_SIZE or set default' >> /app/start_nginx_wrapper.sh && \
    echo 'if ! echo "${EFFECTIVE_SIZE}" | grep -Eq "^[0-9]+[mMkKgG]?$"; then' >> /app/start_nginx_wrapper.sh && \
    echo "  echo \"Warning: NGINX_MAX_BODY_SIZE_VALUE ('\${EFFECTIVE_SIZE}') is invalid or empty. Defaulting to 32M.\"" >> /app/start_nginx_wrapper.sh && \
    echo "  EFFECTIVE_SIZE='32M'" >> /app/start_nginx_wrapper.sh && \
    echo 'fi' >> /app/start_nginx_wrapper.sh && \
    echo '' >> /app/start_nginx_wrapper.sh && \
    echo '# Substitute the placeholder in the template file with the effective size' >> /app/start_nginx_wrapper.sh && \
    echo '# Using | as sed delimiter to avoid issues if EFFECTIVE_SIZE somehow contained /' >> /app/start_nginx_wrapper.sh && \
    echo "sed \"s|__NGINX_MAX_BODY_SIZE_CONFIG_VALUE__|\${EFFECTIVE_SIZE}|g\" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf" >> /app/start_nginx_wrapper.sh && \
    echo '' >> /app/start_nginx_wrapper.sh && \
    echo "# Print the processed config for debugging" >> /app/start_nginx_wrapper.sh && \
    echo "echo '--- Start of Processed Nginx default.conf ---'" >> /app/start_nginx_wrapper.sh && \
    echo "cat /etc/nginx/conf.d/default.conf" >> /app/start_nginx_wrapper.sh && \
    echo "echo '--- End of Processed Nginx default.conf ---'" >> /app/start_nginx_wrapper.sh && \
    echo '' >> /app/start_nginx_wrapper.sh && \
    echo "# Execute Nginx" >> /app/start_nginx_wrapper.sh && \
    echo "exec /usr/sbin/nginx -g 'daemon off;'" >> /app/start_nginx_wrapper.sh && \
    chmod +x /app/start_nginx_wrapper.sh

# REMOVED: The RUN echo command that overwrites the nginx.conf, as we now use a template.

# Expose port
EXPOSE 80

# Define health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Create supervisor log directory
RUN mkdir -p /var/log/supervisor

# Create supervisor configuration
# Using Heredoc for cleaner multiline config
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true                 ; Run Supervisor in the foreground
user=root                     ; Run Supervisor as root
logfile=/dev/stdout           ; Log Supervisor messages to stdout
logfile_maxbytes=0            ; Disable log rotation for stdout
pidfile=/var/run/supervisord.pid

; Program for initial setup (migrations, permissions)
; Runs once at the start
[program:setup]
command=/app/start.sh         ; Execute the setup script
directory=/app
autostart=true
autorestart=false             ; Do not restart if it finishes
startsecs=0                   ; Start immediately
startretries=1                ; Only retry once if it fails immediately
exitcodes=0                   ; Expected exit code is 0
stdout_logfile=/dev/stdout    ; Log stdout to container stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr    ; Log stderr to container stderr
stderr_logfile_maxbytes=0
priority=5                    ; Run before nginx and gunicorn

[program:nginx]
# Command now executes the wrapper script
command=/app/start_nginx_wrapper.sh
autostart=true
autorestart=true              ; Restart nginx if it crashes
startsecs=5                   ; Give setup some time before starting nginx
startretries=5
stdout_logfile=/dev/stdout    ; Log stdout to container stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr    ; Log stderr to container stderr
stderr_logfile_maxbytes=0
priority=10                   ; Start after setup

[program:gunicorn]
command=gunicorn --config /app/gunicorn_config.py "backend:create_app()" ; Start Gunicorn with Application Factory
directory=/app
autostart=true
autorestart=true              ; Restart Gunicorn if it crashes
startsecs=5                   ; Give setup some time before starting gunicorn
startretries=5
stdout_logfile=/dev/stdout    ; Log stdout to container stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr    ; Log stderr to container stderr
stderr_logfile_maxbytes=0
priority=20                   ; Start after setup
stopsignal=QUIT               ; Graceful shutdown signal for Gunicorn
stopwaitsecs=10               ; Wait up to 10 seconds for graceful shutdown
killasgroup=true              ; Ensure all gunicorn processes are killed
stopasgroup=true              ; Ensure all gunicorn processes receive the stop signal
EOF

# Start supervisor which will manage the setup, nginx, and gunicorn processes
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# Copy entrypoint script
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose Postgres data directory as a volume for persistence
VOLUME ["/app/postgres_data"]

ENTRYPOINT ["/app/entrypoint.sh"]
