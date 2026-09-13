#!/usr/bin/env node
/**
 * BankFlow — Service Stub Generator
 *
 * Creates the skeleton structure for all 11 microservices + 2 simulators.
 * Run: node scripts/generate-service-stubs.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const services = [
  { name: 'auth-service',            port: 3001, dir: 'services' },
  { name: 'user-service',            port: 3002, dir: 'services' },
  { name: 'account-service',         port: 3003, dir: 'services' },
  { name: 'ledger-service',          port: 3004, dir: 'services' },
  { name: 'transaction-service',     port: 3005, dir: 'services' },
  { name: 'payment-service',         port: 3006, dir: 'services' },
  { name: 'beneficiary-service',     port: 3007, dir: 'services' },
  { name: 'bank-service',            port: 3008, dir: 'services' },
  { name: 'settlement-service',      port: 3009, dir: 'services' },
  { name: 'reconciliation-service',  port: 3010, dir: 'services' },
  { name: 'notification-service',    port: 3011, dir: 'services' },
  { name: 'payment-network',         port: 4000, dir: 'simulators' },
  { name: 'external-bank',           port: 4001, dir: 'simulators' },
];

for (const svc of services) {
  const svcDir = path.join(ROOT, svc.dir, svc.name);
  const srcDir = path.join(svcDir, 'src');

  fs.mkdirSync(srcDir, { recursive: true });

  // package.json
  const packageJson = {
    name: `@bankflow/${svc.name}`,
    version: '1.0.0',
    description: `BankFlow ${svc.name}`,
    main: './dist/index.js',
    scripts: {
      dev: 'ts-node-dev --respawn --transpile-only --exit-child src/index.ts',
      build: 'tsc --project tsconfig.json',
      start: 'node dist/index.js',
      clean: 'rimraf dist',
    },
    dependencies: {
      '@bankflow/shared': '*',
      'dotenv': '^16.4.5',
      'express': '^4.19.2',
    },
    devDependencies: {
      '@types/express': '^4.17.21',
      '@types/node': '^20.16.0',
      'rimraf': '^5.0.10',
      'ts-node-dev': '^2.0.0',
      'typescript': '^5.5.4',
    },
  };

  fs.writeFileSync(
    path.join(svcDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );

  // tsconfig.json
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: { rootDir: './src', outDir: './dist' },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  fs.writeFileSync(
    path.join(svcDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n'
  );

  // .env.example
  const envExample = `# ${svc.name}
NODE_ENV=development
PORT=${svc.port}
LOG_LEVEL=debug

DATABASE_URL=postgresql://USER:PASS@ep-xxx.neon.tech/\${svc.name.replace(/-service$|$/, '').replace(/-/g, '_')}_db?sslmode=require
DATABASE_DIRECT_URL=postgresql://USER:PASS@ep-xxx-direct.neon.tech/\${svc.name.replace(/-service$|$/, '').replace(/-/g, '_')}_db?sslmode=require

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=bankflow_redis_secret

KAFKA_BROKERS=localhost:9092
RABBITMQ_URL=amqp://bankflow:bankflow_rabbit_secret@localhost:5672/bankflow
`;

  // Generate clean db name from service name
  const dbName = svc.name
    .replace('-service', '')
    .replace('-network', '')
    .replace('-bank', '_bank')
    .replace(/-/g, '_') + '_db';

  const envClean = `# ${svc.name} Environment Variables
NODE_ENV=development
PORT=${svc.port}
LOG_LEVEL=debug

# Neon PostgreSQL
DATABASE_URL=postgresql://USER:PASS@ep-xxx.neon.tech/${dbName}?sslmode=require
DATABASE_DIRECT_URL=postgresql://USER:PASS@ep-xxx-direct.neon.tech/${dbName}?sslmode=require

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=bankflow_redis_secret

# Kafka
KAFKA_BROKERS=localhost:9092

# RabbitMQ
RABBITMQ_URL=amqp://bankflow:bankflow_rabbit_secret@localhost:5672/bankflow
`;

  fs.writeFileSync(path.join(svcDir, '.env.example'), envClean);

  // src/index.ts — minimal Express stub
  const indexTs = `import 'dotenv/config';
import express from 'express';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
} from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// ${svc.name} — Stub
// This stub will be replaced with full implementation on the appropriate day.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = '${svc.name}';
const PORT = parseInt(process.env.PORT ?? '${svc.port}', 10);
const VERSION = '1.0.0';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { stub: 'ok' },
  });
});

// ─── Stub Route ─────────────────────────────────────────────────────────────

app.all('*', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: \`\${SERVICE_NAME} is not yet implemented\`,
    },
  });
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ port: PORT, service: SERVICE_NAME }, \`🔧 \${SERVICE_NAME} (stub) running on :\${PORT}\`);
});

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });
`;

  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTs);

  // Dockerfile
  const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY ${svc.dir}/${svc.name}/package.json ./${svc.dir}/${svc.name}/
COPY ${svc.dir}/${svc.name}/src ./${svc.dir}/${svc.name}/src
COPY ${svc.dir}/${svc.name}/tsconfig.json ./${svc.dir}/${svc.name}/
RUN npm install --workspace=packages/shared --workspace=${svc.dir}/${svc.name}
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=${svc.dir}/${svc.name}

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/${svc.dir}/${svc.name}/dist ./${svc.dir}/${svc.name}/dist
COPY --from=builder /app/${svc.dir}/${svc.name}/package.json ./${svc.dir}/${svc.name}/
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev --workspace=${svc.dir}/${svc.name}
EXPOSE ${svc.port}
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:${svc.port}/health || exit 1
CMD ["node", "${svc.dir}/${svc.name}/dist/index.js"]
`;

  fs.writeFileSync(path.join(svcDir, 'Dockerfile'), dockerfile);

  console.log(`✅ Created ${svc.dir}/${svc.name} (port ${svc.port})`);
}

console.log('\n🎉 All service stubs generated successfully!');
console.log('Run: npm install (from root) to install dependencies.');
