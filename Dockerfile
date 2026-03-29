# ============================================================
# KOUTIX Backend JS — Dockerfile (multi-stage)
# ============================================================

# ── Stage 1: Install dependencies ────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install native build tools for any native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: Production image ─────────────────────────────
FROM node:20-alpine AS runner

# Install tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 koutix && \
    adduser  --system --uid 1001  koutix

# Copy production deps and source
COPY --from=deps --chown=koutix:koutix /app/node_modules ./node_modules
COPY --chown=koutix:koutix src ./src
COPY --chown=koutix:koutix package.json ./

# Create logs directory
RUN mkdir -p logs && chown koutix:koutix logs

ENV NODE_ENV=production

USER koutix

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
