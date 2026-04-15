/*
  Warnings:

  - A unique constraint covering the columns `[numero]` on the table `itens_inventario` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[oc_numero]` on the table `solicitacoes_compra` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `numero` to the `itens_inventario` table without a default value. This is not possible if the table is not empty.
  - Added the required column `oc_numero` to the `solicitacoes_compra` table without a default value. This is not possible if the table is not empty.
  - Made the column `ac_numero` on table `solicitacoes_compra` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "itens_inventario" ADD COLUMN     "numero" VARCHAR(12) NOT NULL;

-- AlterTable
ALTER TABLE "solicitacoes_compra" ADD COLUMN     "oc_numero" VARCHAR(12) NOT NULL,
ALTER COLUMN "ac_numero" SET NOT NULL;

-- CreateTable
CREATE TABLE "contadores" (
    "tipo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "itens_inventario_numero_key" ON "itens_inventario"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_compra_oc_numero_key" ON "solicitacoes_compra"("oc_numero");
