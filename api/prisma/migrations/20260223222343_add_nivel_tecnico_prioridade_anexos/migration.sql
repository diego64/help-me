/*
  Warnings:

  - The values [BAIXA,NORMAL,ALTA,URGENTE] on the enum `PrioridadeChamado` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "NivelTecnico" AS ENUM ('N1', 'N2', 'N3');

-- AlterEnum
BEGIN;
CREATE TYPE "PrioridadeChamado_new" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');
ALTER TABLE "public"."chamados" ALTER COLUMN "prioridade" DROP DEFAULT;
ALTER TABLE "chamados" ALTER COLUMN "prioridade" TYPE "PrioridadeChamado_new" USING ("prioridade"::text::"PrioridadeChamado_new");
ALTER TYPE "PrioridadeChamado" RENAME TO "PrioridadeChamado_old";
ALTER TYPE "PrioridadeChamado_new" RENAME TO "PrioridadeChamado";
DROP TYPE "public"."PrioridadeChamado_old";
ALTER TABLE "chamados" ALTER COLUMN "prioridade" SET DEFAULT 'P4';
COMMIT;

-- AlterTable
ALTER TABLE "chamados" ALTER COLUMN "prioridade" SET DEFAULT 'P4';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "nivel" "NivelTecnico" DEFAULT 'N1';

-- CreateTable
CREATE TABLE "anexos_chamado" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "nome_arquivo" VARCHAR(255) NOT NULL,
    "nome_original" VARCHAR(255) NOT NULL,
    "mimetype" VARCHAR(100) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "bucket_minio" VARCHAR(100) NOT NULL,
    "objeto_minio" VARCHAR(255) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletado_em" TIMESTAMPTZ(3),

    CONSTRAINT "anexos_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anexos_chamado_chamado_id_idx" ON "anexos_chamado"("chamado_id");

-- CreateIndex
CREATE INDEX "anexos_chamado_autor_id_idx" ON "anexos_chamado"("autor_id");

-- CreateIndex
CREATE INDEX "anexos_chamado_criado_em_idx" ON "anexos_chamado"("criado_em");

-- CreateIndex
CREATE INDEX "anexos_chamado_deletado_em_idx" ON "anexos_chamado"("deletado_em");

-- CreateIndex
CREATE INDEX "anexos_chamado_chamado_id_deletado_em_idx" ON "anexos_chamado"("chamado_id", "deletado_em");

-- CreateIndex
CREATE INDEX "usuarios_nivel_idx" ON "usuarios"("nivel");

-- CreateIndex
CREATE INDEX "usuarios_regra_nivel_idx" ON "usuarios"("regra", "nivel");

-- AddForeignKey
ALTER TABLE "anexos_chamado" ADD CONSTRAINT "anexos_chamado_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_chamado" ADD CONSTRAINT "anexos_chamado_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
