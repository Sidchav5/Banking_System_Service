FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY simulators/payment-network/package.json ./simulators/payment-network/
COPY simulators/payment-network/src ./simulators/payment-network/src
COPY simulators/payment-network/tsconfig.json ./simulators/payment-network/
RUN npm install --workspace=packages/shared --workspace=simulators/payment-network
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=simulators/payment-network

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/simulators/payment-network/dist ./simulators/payment-network/dist
COPY --from=builder /app/simulators/payment-network/package.json ./simulators/payment-network/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=simulators/payment-network
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "simulators/payment-network/dist/index.js"]
