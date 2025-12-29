/*
  Warnings:

  - You are about to drop the column `atualizadoEm` on the `chamados` table. All the data in the column will be lost.
  - You are about to drop the column `descricaoEncerramento` on the `chamados` table. All the data in the column will be lost.
  - You are about to drop the column `encerradoEm` on the `chamados` table. All the data in the column will be lost.
  - You are about to drop the column `geradoEm` on the `chamados` table. All the data in the column will be lost.
  - You are about to drop the column `tecnicoId` on the `chamados` table. All the data in the column will be lost.
  - You are about to drop the column `usuarioId` on the `chamados` table. All the data in the column will be lost.
  - You are about to alter the column `OS` on the `chamados` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to drop the column `chamadoId` on the `ordens_de_servico` table. All the data in the column will be lost.
  - You are about to drop the column `servicoId` on the `ordens_de_servico` table. All the data in the column will be lost.
  - You are about to drop the column `atualizadoEm` on the `servicos` table. All the data in the column will be lost.
  - You are about to drop the column `geradoEm` on the `servicos` table. All the data in the column will be lost.
  - You are about to drop the column `atualizadoEm` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `geradoEm` on the `usuarios` table. All the data in the column will be lost.
  - You are about to alter the column `nome` on the `usuarios` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `sobrenome` on the `usuarios` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `email` on the `usuarios` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `usuarios` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - A unique constraint covering the columns `[chamado_id,servico_id]` on the table `ordens_de_servico` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `atualizado_em` to the `chamados` table without a default value. This is not possible if the table is not empty.
  - Added the required column `usuario_id` to the `chamados` table without a default value. This is not possible if the table is not empty.
  - Added the required column `atualizado_em` to the `expedientes` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `entrada` on the `expedientes` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `saida` on the `expedientes` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `atualizado_em` to the `ordens_de_servico` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chamado_id` to the `ordens_de_servico` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servico_id` to the `ordens_de_servico` table without a default value. This is not possible if the table is not empty.
  - Added the required column `atualizado_em` to the `servicos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `atualizado_em` to the `usuarios` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "chamados" DROP CONSTRAINT "chamados_tecnicoId_fkey";

-- DropForeignKey
ALTER TABLE "chamados" DROP CONSTRAINT "chamados_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "ordens_de_servico" DROP CONSTRAINT "ordens_de_servico_chamadoId_fkey";

-- DropForeignKey
ALTER TABLE "ordens_de_servico" DROP CONSTRAINT "ordens_de_servico_servicoId_fkey";

-- DropIndex
DROP INDEX "chamados_geradoEm_idx";

-- DropIndex
DROP INDEX "chamados_tecnicoId_idx";

-- DropIndex
DROP INDEX "chamados_usuarioId_idx";

-- DropIndex
DROP INDEX "ordens_de_servico_chamadoId_idx";

-- DropIndex
DROP INDEX "ordens_de_servico_chamadoId_servicoId_key";

-- DropIndex
DROP INDEX "ordens_de_servico_servicoId_idx";

-- AlterTable
ALTER TABLE "chamados" DROP COLUMN "atualizadoEm",
DROP COLUMN "descricaoEncerramento",
DROP COLUMN "encerradoEm",
DROP COLUMN "geradoEm",
DROP COLUMN "tecnicoId",
DROP COLUMN "usuarioId",
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "deletado_em" TIMESTAMPTZ(3),
ADD COLUMN     "descricao_encerramento" TEXT,
ADD COLUMN     "encerrado_em" TIMESTAMPTZ(3),
ADD COLUMN     "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tecnico_id" TEXT,
ADD COLUMN     "usuario_id" TEXT NOT NULL,
ALTER COLUMN "OS" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "expedientes" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "deletado_em" TIMESTAMPTZ(3),
ADD COLUMN     "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "entrada",
ADD COLUMN     "entrada" TIME(0) NOT NULL,
DROP COLUMN "saida",
ADD COLUMN     "saida" TIME(0) NOT NULL;

-- AlterTable
ALTER TABLE "ordens_de_servico" DROP COLUMN "chamadoId",
DROP COLUMN "servicoId",
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "chamado_id" TEXT NOT NULL,
ADD COLUMN     "deletado_em" TIMESTAMPTZ(3),
ADD COLUMN     "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "servico_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "servicos" DROP COLUMN "atualizadoEm",
DROP COLUMN "geradoEm",
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "deletado_em" TIMESTAMPTZ(3),
ADD COLUMN     "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "atualizadoEm",
DROP COLUMN "geradoEm",
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "deletado_em" TIMESTAMPTZ(3),
ADD COLUMN     "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "nome" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "sobrenome" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE INDEX "chamados_usuario_id_idx" ON "chamados"("usuario_id");

-- CreateIndex
CREATE INDEX "chamados_tecnico_id_idx" ON "chamados"("tecnico_id");

-- CreateIndex
CREATE INDEX "chamados_gerado_em_idx" ON "chamados"("gerado_em");

-- CreateIndex
CREATE INDEX "chamados_OS_idx" ON "chamados"("OS");

-- CreateIndex
CREATE INDEX "chamados_deletado_em_idx" ON "chamados"("deletado_em");

-- CreateIndex
CREATE INDEX "chamados_status_gerado_em_idx" ON "chamados"("status", "gerado_em");

-- CreateIndex
CREATE INDEX "chamados_tecnico_id_status_idx" ON "chamados"("tecnico_id", "status");

-- CreateIndex
CREATE INDEX "chamados_usuario_id_status_idx" ON "chamados"("usuario_id", "status");

-- CreateIndex
CREATE INDEX "ordens_de_servico_chamado_id_idx" ON "ordens_de_servico"("chamado_id");

-- CreateIndex
CREATE INDEX "ordens_de_servico_servico_id_idx" ON "ordens_de_servico"("servico_id");

-- CreateIndex
CREATE INDEX "ordens_de_servico_deletado_em_idx" ON "ordens_de_servico"("deletado_em");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_de_servico_chamado_id_servico_id_key" ON "ordens_de_servico"("chamado_id", "servico_id");

-- CreateIndex
CREATE INDEX "servicos_nome_idx" ON "servicos"("nome");

-- CreateIndex
CREATE INDEX "servicos_deletado_em_idx" ON "servicos"("deletado_em");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_deletado_em_idx" ON "usuarios"("deletado_em");

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
