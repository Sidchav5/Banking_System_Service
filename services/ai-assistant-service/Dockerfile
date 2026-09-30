FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Create data directory for chunks.jsonl and embedding cache
RUN mkdir -p data

EXPOSE 3012

CMD ["node", "dist/index.js"]
