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

# Stage 2: Serve the static files with nginx running as the unprivileged nginx user.
# Nginx configuration is owned by this repository (nginx.conf), so no runtime
# string-patching of the upstream image is needed and no capability such as
# CAP_CHOWN / CAP_SETUID / CAP_NET_BIND_SERVICE is required at container start.
FROM nginx:1.29-alpine AS runner

# Copy static export and our nginx configuration.
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Remove the image's default server config, then pre-create the runtime
# directories owned by the nginx user during the build (as root) so the
# container itself never needs to chown anything at startup.
RUN rm /etc/nginx/conf.d/default.conf \
    && mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi /var/cache/nginx \
    && chown -R nginx:nginx /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi /var/cache/nginx

# Run as unprivileged nginx user (uid 101)
USER nginx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
