# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

# Install root deps (NestJS server + shared)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build:server

# Build web app (src/web has its own package.json)
WORKDIR /app/src/web
COPY src/web/package*.json ./
RUN npm ci --legacy-peer-deps
# Vite outDir is ../../dist/web → /app/dist/web
RUN npm run build

WORKDIR /app


# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat

# Use existing 'node' user (UID 1000) — no need to create a new one
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Web assets are already in dist/web (built above)

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server/main.js"]
