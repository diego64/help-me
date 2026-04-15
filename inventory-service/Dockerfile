# ============================================================
# Stage 1: builder — instala todas as deps, gera Prisma client e compila
# ============================================================
FROM node:20-slim AS builder
WORKDIR /app

RUN npm install -g pnpm@8.15.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec prisma generate
RUN pnpm run build

# ============================================================
# Stage 2: runtime — imagem final slim apenas com prod deps
# ============================================================
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system appuser && useradd --system --gid appuser appuser

RUN npm install -g pnpm@8.15.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copia schema (necessário para prisma generate e migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Gera o Prisma Client no runtime stage com as deps de prod já instaladas
RUN pnpm exec prisma generate

# Copia o build compilado
COPY --from=builder /app/dist ./dist

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3334
CMD ["node", "dist/server.js"]
