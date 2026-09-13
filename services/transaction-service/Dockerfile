FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/transaction-service/package.json ./services/transaction-service/
COPY services/transaction-service/src ./services/transaction-service/src
COPY services/transaction-service/tsconfig.json ./services/transaction-service/
RUN npm install --workspace=packages/shared --workspace=services/transaction-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/transaction-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/transaction-service/dist ./services/transaction-service/dist
COPY --from=builder /app/services/transaction-service/package.json ./services/transaction-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/transaction-service
EXPOSE 3005
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3005/health || exit 1
CMD ["node", "services/transaction-service/dist/index.js"]
