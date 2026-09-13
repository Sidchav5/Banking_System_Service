FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/user-service/package.json ./services/user-service/
COPY services/user-service/src ./services/user-service/src
COPY services/user-service/tsconfig.json ./services/user-service/
RUN npm install --workspace=packages/shared --workspace=services/user-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/user-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/user-service/dist ./services/user-service/dist
COPY --from=builder /app/services/user-service/package.json ./services/user-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/user-service
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "services/user-service/dist/index.js"]
