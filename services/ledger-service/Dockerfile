FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/ledger-service/package.json ./services/ledger-service/
COPY services/ledger-service/src ./services/ledger-service/src
COPY services/ledger-service/tsconfig.json ./services/ledger-service/
RUN npm install --workspace=packages/shared --workspace=services/ledger-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/ledger-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/ledger-service/dist ./services/ledger-service/dist
COPY --from=builder /app/services/ledger-service/package.json ./services/ledger-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/ledger-service
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3004/health || exit 1
CMD ["node", "services/ledger-service/dist/index.js"]
