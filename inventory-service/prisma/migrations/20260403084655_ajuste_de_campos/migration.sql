/*
  Warnings:

  - The `motivo` column on the `itens_baixa` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[av_numero]` on the table `baixas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ac_numero]` on the table `solicitacoes_compra` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `perfil_solicitante` on the `baixas` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `unidade` on the `itens_inventario` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('UN', 'KG', 'M', 'CX', 'L', 'PC');

-- CreateEnum
CREATE TYPE "MotivoBaixa" AS ENUM ('QUEBRA', 'PERDA', 'VENCIMENTO', 'OBSOLESCENCIA', 'OUTROS');

-- AlterTable
ALTER TABLE "baixas" ADD COLUMN     "av_numero" VARCHAR(12),
DROP COLUMN "perfil_solicitante",
ADD COLUMN     "perfil_solicitante" VARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE "itens_baixa" DROP COLUMN "motivo",
ADD COLUMN     "motivo" "MotivoBaixa";

-- AlterTable
ALTER TABLE "itens_inventario" DROP COLUMN "unidade",
ADD COLUMN     "unidade" "UnidadeMedida" NOT NULL;

-- AlterTable
ALTER TABLE "movimentacoes_estoque" ADD COLUMN     "setor_destino_id" TEXT,
ADD COLUMN     "setor_destino_nome" VARCHAR(100);

-- AlterTable
ALTER TABLE "reembolsos" ADD COLUMN     "cnpj_fornecedor" VARCHAR(18),
ADD COLUMN     "data_emissao" TIMESTAMPTZ(3),
ADD COLUMN     "nfe" VARCHAR(44);

-- AlterTable
ALTER TABLE "solicitacoes_compra" ADD COLUMN     "ac_numero" VARCHAR(12),
ADD COLUMN     "data_emissao" TIMESTAMPTZ(3),
ADD COLUMN     "nfe" VARCHAR(44);

-- CreateIndex
CREATE UNIQUE INDEX "baixas_av_numero_key" ON "baixas"("av_numero");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_item_id_criado_em_idx" ON "movimentacoes_estoque"("item_id", "criado_em");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_motivo_idx" ON "movimentacoes_estoque"("motivo");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_tipo_idx" ON "movimentacoes_estoque"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_compra_ac_numero_key" ON "solicitacoes_compra"("ac_numero");
