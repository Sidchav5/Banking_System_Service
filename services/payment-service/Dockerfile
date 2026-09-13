FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/payment-service/package.json ./services/payment-service/
COPY services/payment-service/src ./services/payment-service/src
COPY services/payment-service/tsconfig.json ./services/payment-service/
RUN npm install --workspace=packages/shared --workspace=services/payment-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/payment-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/payment-service/dist ./services/payment-service/dist
COPY --from=builder /app/services/payment-service/package.json ./services/payment-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/payment-service
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node", "services/payment-service/dist/index.js"]
