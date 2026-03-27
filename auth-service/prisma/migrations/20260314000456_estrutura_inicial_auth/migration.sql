-- CreateEnum
CREATE TYPE "Regra" AS ENUM ('ADMIN', 'TECNICO', 'USUARIO');

-- CreateEnum
CREATE TYPE "EventoAuth" AS ENUM ('LOGIN_SUCESSO', 'LOGIN_FALHA', 'LOGOUT', 'TOKEN_RENOVADO', 'TOKEN_REVOGADO', 'SENHA_ALTERADA', 'USUARIO_CRIADO', 'USUARIO_DESATIVADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "sobrenome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(512) NOT NULL,
    "regra" "Regra" NOT NULL,
    "refresh_token" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "deletado_em" TIMESTAMPTZ(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_auth" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "evento" "EventoAuth" NOT NULL,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "metadata" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_auth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_regra_idx" ON "usuarios"("regra");

-- CreateIndex
CREATE INDEX "usuarios_ativo_idx" ON "usuarios"("ativo");

-- CreateIndex
CREATE INDEX "usuarios_deletado_em_idx" ON "usuarios"("deletado_em");

-- CreateIndex
CREATE INDEX "usuarios_regra_ativo_idx" ON "usuarios"("regra", "ativo");

-- CreateIndex
CREATE INDEX "auditoria_auth_usuario_id_idx" ON "auditoria_auth"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_auth_evento_idx" ON "auditoria_auth"("evento");

-- CreateIndex
CREATE INDEX "auditoria_auth_criado_em_idx" ON "auditoria_auth"("criado_em");

-- CreateIndex
CREATE INDEX "auditoria_auth_usuario_id_evento_idx" ON "auditoria_auth"("usuario_id", "evento");

-- CreateIndex
CREATE INDEX "auditoria_auth_usuario_id_criado_em_idx" ON "auditoria_auth"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "auditoria_auth" ADD CONSTRAINT "auditoria_auth_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
