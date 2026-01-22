# ========================================
# STAGE 1: Dependencies (Produção)
# ========================================
FROM node:20-alpine AS deps

# Habilitar pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Definir diretório de trabalho
WORKDIR /app

# Copiar apenas arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar APENAS dependências de produção
RUN pnpm install --frozen-lockfile --prod

# ========================================
# STAGE 2: Builder (Compilação)
# ========================================
FROM node:20-alpine AS builder

# Habilitar pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar TODAS as dependências (incluindo devDependencies)
RUN pnpm install --frozen-lockfile

# Copiar schema do Prisma
COPY prisma ./prisma

# Gerar Prisma Client usando pnpm
RUN pnpm prisma generate

# Copiar código fonte
COPY src ./src
COPY tsconfig.json ./
COPY tsup.config.ts* ./

# Compilar TypeScript para JavaScript usando pnpm
RUN pnpm run build

# ========================================
# STAGE 3: Production Runtime
# ========================================
FROM node:20-alpine AS production

# Metadata do container
ARG VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

LABEL maintainer="Diego Ferreira L.G.Oliveira <diegoferreira1964@gmail.com>"
LABEL description="Help-Me API - Sistema de Helpdesk"
LABEL version="${VERSION}"
LABEL org.opencontainers.image.title="Help-Me API"
LABEL org.opencontainers.image.description="API para sistema de Help Desk"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
LABEL org.opencontainers.image.vendor="Help-Me Team"

# Instalar dependências do sistema
RUN apk add --no-cache \
    dumb-init \
    openssl \
    curl \
    && rm -rf /var/cache/apk/*

# Habilitar pnpm via corepack no stage de produção
RUN corepack enable && corepack prepare pnpm@latest --activate

# Criar grupo e usuário 'prod' (não-root para segurança)
RUN addgroup -g 1001 -S prod && \
    adduser -S prod -u 1001 -G prod

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e pnpm-lock.yaml
COPY --chown=prod:prod package.json pnpm-lock.yaml ./

# Copiar schema do Prisma
COPY --chown=prod:prod prisma ./prisma

# Copiar dependências de produção do stage deps
COPY --from=deps --chown=prod:prod /app/node_modules ./node_modules

# Copiar toda a estrutura .pnpm que contém o Prisma Client gerado
COPY --from=builder --chown=prod:prod /app/node_modules/.pnpm ./node_modules/.pnpm

# Copiar código compilado do stage builder
COPY --from=builder --chown=prod:prod /app/dist ./dist

# Criar diretórios necessários com permissões corretas
RUN mkdir -p /app/uploads /app/logs && \
    chown -R prod:prod /app && \
    chmod -R 755 /app/uploads /app/logs

# Mudar para usuário não-root
USER prod

# Expor porta da aplicação
EXPOSE 3000

# Definir variáveis de ambiente
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=America/Sao_Paulo

# Healthcheck para monitoramento usando pnpm
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Usar dumb-init para gerenciar processos corretamente
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar a aplicação
CMD ["node", "dist/server.cjs"]
