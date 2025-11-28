/*
  Warnings:

  - You are about to drop the `Chamado` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Expediente` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrdemDeServico` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Servico` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Chamado" DROP CONSTRAINT "Chamado_tecnicoId_fkey";

-- DropForeignKey
ALTER TABLE "Chamado" DROP CONSTRAINT "Chamado_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "Expediente" DROP CONSTRAINT "Expediente_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "OrdemDeServico" DROP CONSTRAINT "OrdemDeServico_chamadoId_fkey";

-- DropForeignKey
ALTER TABLE "OrdemDeServico" DROP CONSTRAINT "OrdemDeServico_servicoId_fkey";

-- DropTable
DROP TABLE "Chamado";

-- DropTable
DROP TABLE "Expediente";

-- DropTable
DROP TABLE "OrdemDeServico";

-- DropTable
DROP TABLE "Servico";

-- DropTable
DROP TABLE "Usuario";

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sobrenome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "regra" "Regra" NOT NULL,
    "setor" "Setor",
    "telefone" TEXT,
    "ramal" TEXT,
    "avatarUrl" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "refreshToken" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expedientes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "entrada" TEXT NOT NULL,
    "saida" TEXT NOT NULL,

    CONSTRAINT "expedientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamados" (
    "id" TEXT NOT NULL,
    "OS" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "descricaoEncerramento" TEXT,
    "status" "ChamadoStatus" NOT NULL DEFAULT 'ABERTO',
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "encerradoEm" TIMESTAMP(3),
    "usuarioId" TEXT NOT NULL,
    "tecnicoId" TEXT,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_de_servico" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,

    CONSTRAINT "ordens_de_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_regra_idx" ON "usuarios"("regra");

-- CreateIndex
CREATE INDEX "usuarios_ativo_idx" ON "usuarios"("ativo");

-- CreateIndex
CREATE INDEX "usuarios_setor_idx" ON "usuarios"("setor");

-- CreateIndex
CREATE INDEX "expedientes_usuarioId_idx" ON "expedientes"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "servicos_nome_key" ON "servicos"("nome");

-- CreateIndex
CREATE INDEX "servicos_ativo_idx" ON "servicos"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "chamados_OS_key" ON "chamados"("OS");

-- CreateIndex
CREATE INDEX "chamados_usuarioId_idx" ON "chamados"("usuarioId");

-- CreateIndex
CREATE INDEX "chamados_tecnicoId_idx" ON "chamados"("tecnicoId");

-- CreateIndex
CREATE INDEX "chamados_status_idx" ON "chamados"("status");

-- CreateIndex
CREATE INDEX "chamados_geradoEm_idx" ON "chamados"("geradoEm");

-- CreateIndex
CREATE INDEX "ordens_de_servico_chamadoId_idx" ON "ordens_de_servico"("chamadoId");

-- CreateIndex
CREATE INDEX "ordens_de_servico_servicoId_idx" ON "ordens_de_servico"("servicoId");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_de_servico_chamadoId_servicoId_key" ON "ordens_de_servico"("chamadoId", "servicoId");

-- AddForeignKey
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "servicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
