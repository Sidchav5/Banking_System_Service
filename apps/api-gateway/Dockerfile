# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json ./
COPY tsconfig.base.json ./

# Copy shared package (dependency)
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy gateway
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/api-gateway/src ./apps/api-gateway/src
COPY apps/api-gateway/tsconfig.json ./apps/api-gateway/

# Install all dependencies
RUN npm install --workspace=packages/shared --workspace=apps/api-gateway

# Build shared package first (gateway depends on it)
RUN npm run build --workspace=packages/shared

# Build gateway
RUN npm run build --workspace=apps/api-gateway

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN npm install --omit=dev --workspace=apps/api-gateway

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api-gateway/dist/index.js"]
