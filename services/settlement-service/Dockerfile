FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/settlement-service/package.json ./services/settlement-service/
COPY services/settlement-service/src ./services/settlement-service/src
COPY services/settlement-service/tsconfig.json ./services/settlement-service/
RUN npm install --workspace=packages/shared --workspace=services/settlement-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/settlement-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/settlement-service/dist ./services/settlement-service/dist
COPY --from=builder /app/services/settlement-service/package.json ./services/settlement-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/settlement-service
EXPOSE 3009
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3009/health || exit 1
CMD ["node", "services/settlement-service/dist/index.js"]
