# ============================================================
# Stage 1: builder — instala todas as deps, gera Prisma client e compila
# ============================================================
FROM node:20-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@8.15.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Gera o Prisma client com os binários corretos para o target
RUN pnpm exec prisma generate

# Compila o TypeScript via tsup (bundle CJS, aliases resolvidos)
RUN pnpm run build

# ============================================================
# Stage 2: runtime — imagem final slim apenas com prod deps
# ============================================================
FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Cria usuário não-root antes de copiar arquivos
RUN groupadd --system appuser && useradd --system --gid appuser appuser

RUN npm install -g pnpm@8.15.1

# Instala apenas dependências de produção
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copia schema e migrations (necessário para prisma migrate deploy no initContainer)
COPY --from=builder /app/prisma ./prisma

# Re-gera o Prisma client no contexto das prod deps
RUN pnpm exec prisma generate

# Copia o build compilado
COPY --from=builder /app/dist ./dist

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3334

CMD ["node", "dist/server.js"]
