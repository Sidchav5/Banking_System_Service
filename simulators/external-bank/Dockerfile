FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY simulators/external-bank/package.json ./simulators/external-bank/
COPY simulators/external-bank/src ./simulators/external-bank/src
COPY simulators/external-bank/tsconfig.json ./simulators/external-bank/
RUN npm install --workspace=packages/shared --workspace=simulators/external-bank
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=simulators/external-bank

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/simulators/external-bank/dist ./simulators/external-bank/dist
COPY --from=builder /app/simulators/external-bank/package.json ./simulators/external-bank/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=simulators/external-bank
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:4001/health || exit 1
CMD ["node", "simulators/external-bank/dist/index.js"]
