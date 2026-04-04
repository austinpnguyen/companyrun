# =============================================================
# CompanyRun — Multi-stage Dockerfile
# =============================================================
# Builds both frontend and backend, then creates a slim runtime.
# ARM64-compatible (Raspberry Pi 4) and x86_64.
#
# Build:  docker build -t companyrun .
# Run:    docker run --env-file .env -p 3000:3000 companyrun
# =============================================================

# ─── Stage 1: Build Frontend ────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

# Install deps first (layer caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build


# ─── Stage 2: Build Backend ─────────────────────────────────
FROM node:20-slim AS backend-build

WORKDIR /app

# Install deps first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build


# ─── Stage 3: Production Runtime ────────────────────────────
FROM node:20-slim AS runtime

# Labels
LABEL maintainer="CompanyRun"
LABEL description="Multi-agent AI company orchestration system"
LABEL org.opencontainers.image.source="https://github.com/your-org/companyrun"

# Security: run as non-root
RUN groupadd --gid 1001 companyrun && \
    useradd --uid 1001 --gid companyrun --shell /bin/sh --create-home companyrun

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy compiled backend from build stage
COPY --from=backend-build /app/dist ./dist

# Copy built frontend from build stage
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy config files
COPY ecosystem.config.js ./
COPY drizzle.config.ts ./

# Create logs directory
RUN mkdir -p logs && chown -R companyrun:companyrun /app

# Switch to non-root user
USER companyrun

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

# Set default environment
ENV NODE_ENV=production
ENV PORT=3000

# Start the server
CMD ["node", "dist/index.js"]
