FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/auth-service/package.json ./services/auth-service/
COPY services/auth-service/src ./services/auth-service/src
COPY services/auth-service/tsconfig.json ./services/auth-service/
RUN npm install --workspace=packages/shared --workspace=services/auth-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/auth-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/auth-service/dist ./services/auth-service/dist
COPY --from=builder /app/services/auth-service/package.json ./services/auth-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/auth-service
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "services/auth-service/dist/index.js"]
