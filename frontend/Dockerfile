# Stage 1: Build the Next.js static export
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Verify that the static export artifact was produced
RUN test -f /app/out/index.html && test -d /app/out/_next

# Stage 2: Serve the static files with nginx (unprivileged)
# Use nginx:alpine but configure it to run as non-root (no chown required at runtime).
# We pre-create the runtime directories owned by nginx uid 101 during the build step
# so that no capability (CAP_CHOWN / CAP_SETUID) is needed at container start.
FROM nginx:1.27-alpine AS runner

# Copy static export
COPY --from=builder /app/out /usr/share/nginx/html

# Remove default nginx config and write our own.
# Configure nginx to run without master process needing root:
#   - listen on unprivileged port 3000 (no CAP_NET_BIND_SERVICE below 1024)
#   - use /tmp for all runtime state (writable by any user, no chown needed)
#   - pid file in /tmp (nginx default needs /var/run/nginx.pid, but we redirect)
RUN rm /etc/nginx/conf.d/default.conf \
    && printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    # Serve pre-rendered pages; fall back to index.html for SPA navigation\n\
    location / {\n\
        try_files $uri $uri/ $uri.html /index.html;\n\
    }\n\
    # Static assets have content-addressed hashes — safe to cache\n\
    location /_next/static/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/infrarender.conf \
    && sed -i 's|pid\s*/var/run/nginx.pid;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && sed -i '/^http {/a\\    client_body_temp_path /tmp/client_body;\n    proxy_temp_path /tmp/proxy;\n    fastcgi_temp_path /tmp/fastcgi;\n    uwsgi_temp_path /tmp/uwsgi;\n    scgi_temp_path /tmp/scgi;' /etc/nginx/nginx.conf \
    && mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi \
    && chown -R nginx:nginx /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown nginx:nginx /etc/nginx/conf.d/infrarender.conf

# Run as unprivileged nginx user (uid 101)
USER nginx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
