FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/beneficiary-service/package.json ./services/beneficiary-service/
COPY services/beneficiary-service/src ./services/beneficiary-service/src
COPY services/beneficiary-service/tsconfig.json ./services/beneficiary-service/
RUN npm install --workspace=packages/shared --workspace=services/beneficiary-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/beneficiary-service

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/beneficiary-service/dist ./services/beneficiary-service/dist
COPY --from=builder /app/services/beneficiary-service/package.json ./services/beneficiary-service/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=services/beneficiary-service
EXPOSE 3007
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3007/health || exit 1
CMD ["node", "services/beneficiary-service/dist/index.js"]
