# Multi-stage / Production Dockerfile for SplitPay
FROM node:20-bookworm-slim AS base

# Install build tools required for native better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install all dependencies including build tools
RUN npm ci

# Copy application source code
COPY tsconfig.json tailwind.config.js postcss.config.js ./
COPY src ./src
COPY server.ts ./

# Build Next.js production bundle
RUN npx next build

# Prune dev dependencies if needed, or keep for tsx server execution
RUN mkdir -p /app/data

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

# Persistent volume for SQLite database
VOLUME ["/app/data"]

# Start custom HTTP + Socket.IO server
CMD ["npx", "tsx", "server.ts"]
