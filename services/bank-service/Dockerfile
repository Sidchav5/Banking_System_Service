FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/bank-service/package.json ./services/bank-service/
COPY services/bank-service/src ./services/bank-service/src
COPY services/bank-service/tsconfig.json ./services/bank-service/
RUN npm install --workspace=packages/shared --workspace=services/bank-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/bank-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/bank-service/dist ./services/bank-service/dist
COPY --from=builder /app/services/bank-service/package.json ./services/bank-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/bank-service
EXPOSE 3008
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3008/health || exit 1
CMD ["node", "services/bank-service/dist/index.js"]
