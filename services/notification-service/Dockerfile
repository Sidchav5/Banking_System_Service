FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/notification-service/package.json ./services/notification-service/
COPY services/notification-service/src ./services/notification-service/src
COPY services/notification-service/tsconfig.json ./services/notification-service/
RUN npm install --workspace=packages/shared --workspace=services/notification-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/notification-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=builder /app/services/notification-service/package.json ./services/notification-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/notification-service
EXPOSE 3011
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3011/health || exit 1
CMD ["node", "services/notification-service/dist/index.js"]
