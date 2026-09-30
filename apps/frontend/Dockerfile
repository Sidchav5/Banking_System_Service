# ── Stage 1: Build Vite app ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=""

# Copy workspace files
COPY package.json package-lock.json ./

# Copy shared (types used by frontend)
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src           ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy frontend
COPY apps/frontend/package.json  ./apps/frontend/
COPY apps/frontend/src           ./apps/frontend/src
COPY apps/frontend/public        ./apps/frontend/public
COPY apps/frontend/index.html    ./apps/frontend/
COPY apps/frontend/vite.config.ts ./apps/frontend/
COPY apps/frontend/tsconfig.json ./apps/frontend/
COPY apps/frontend/tsconfig.app.json ./apps/frontend/ 2>/dev/null || true

RUN npm install --workspace=packages/shared --workspace=apps/frontend
RUN npm run build --workspace=packages/shared

# Build with optional VITE_API_URL override
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace=apps/frontend

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config (API proxy → gateway)
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/bankflow.conf

# Copy built assets
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s \
  CMD wget -qO- http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
