FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/account-service/package.json ./services/account-service/
COPY services/account-service/src ./services/account-service/src
COPY services/account-service/tsconfig.json ./services/account-service/
RUN npm install --workspace=packages/shared --workspace=services/account-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/account-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/account-service/dist ./services/account-service/dist
COPY --from=builder /app/services/account-service/package.json ./services/account-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/account-service
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "services/account-service/dist/index.js"]
