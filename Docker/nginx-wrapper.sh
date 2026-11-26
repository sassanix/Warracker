#!/bin/bash
set -euo pipefail
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Nginx..."

# Wait for setup to create the nginx config
for i in {1..30}; do
    if [ -f /run/nginx-init/default.conf ]; then
        mv /run/nginx-init/default.conf /etc/nginx/conf.d/default.conf
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nginx configuration applied"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Using template config"
        cp /etc/nginx/conf.d/default.conf.template /etc/nginx/conf.d/default.conf
    fi
    sleep 1
done

# Test nginx configuration
nginx -t

exec /usr/sbin/nginx -g 'daemon off;'
