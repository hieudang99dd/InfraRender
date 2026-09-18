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

# Stage 2: Serve the static files with nginx
FROM nginx:1.27-alpine AS runner

# Remove the default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add a simple config that serves the static export and falls back to index.html
# for client-side routing (Next.js trailingSlash export pattern).
COPY --from=builder /app/out /usr/share/nginx/html

RUN printf 'server {\n\
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
}\n' > /etc/nginx/conf.d/infrarender.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
