# ========================================
# STAGE 1: Dependencies (Produção)
# ========================================
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

# ========================================
# STAGE 2: Builder (Compilação)
# ========================================
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY prisma ./prisma

RUN pnpm prisma generate

COPY src ./src
COPY tsconfig.json ./
COPY tsup.config.ts ./

RUN pnpm run build

# ========================================
# STAGE 3: Production Runtime
# ========================================
FROM node:20-alpine AS production

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

LABEL maintainer="Diego Ferreira L.G.Oliveira <diegoferreira1964@gmail.com>"
LABEL description="Help-Me Auth Service — autenticação, autorização e RBAC"
LABEL version="${VERSION}"
LABEL org.opencontainers.image.title="Help-Me Auth Service"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"

# hadolint ignore=DL3018
RUN apk add --no-cache \
    dumb-init \
    openssl \
    curl

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -g 1001 -S auth && \
    adduser -S auth -u 1001 -G auth

WORKDIR /app

COPY --chown=auth:auth package.json pnpm-lock.yaml ./
COPY --chown=auth:auth prisma ./prisma

# Dependências de produção
COPY --from=deps --chown=auth:auth /app/node_modules ./node_modules

# Store completo do pnpm (inclui prisma CLI para migrations)
COPY --from=builder --chown=auth:auth /app/node_modules/.pnpm ./node_modules/.pnpm

# Código compilado
COPY --from=builder --chown=auth:auth /app/dist ./dist

RUN mkdir -p /app/logs && \
    chown -R auth:auth /app && \
    chmod -R 755 /app/logs

USER auth

EXPOSE 3333

ENV NODE_ENV=production \
    PORT=3333 \
    TZ=America/Sao_Paulo

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
