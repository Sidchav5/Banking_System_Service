FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/reconciliation-service/package.json ./services/reconciliation-service/
COPY services/reconciliation-service/src ./services/reconciliation-service/src
COPY services/reconciliation-service/tsconfig.json ./services/reconciliation-service/
RUN npm install --workspace=packages/shared --workspace=services/reconciliation-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/reconciliation-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/reconciliation-service/dist ./services/reconciliation-service/dist
COPY --from=builder /app/services/reconciliation-service/package.json ./services/reconciliation-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/reconciliation-service
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3010/health || exit 1
CMD ["node", "services/reconciliation-service/dist/index.js"]
