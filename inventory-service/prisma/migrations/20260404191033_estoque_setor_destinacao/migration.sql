-- AlterEnum
ALTER TYPE "MotivoMovimentacao" ADD VALUE 'DESTINACAO';

-- CreateTable
CREATE TABLE "estoque_setor" (
    "id" TEXT NOT NULL,
    "item_inventario_id" TEXT NOT NULL,
    "setor" VARCHAR(50) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estoque_setor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estoque_setor_setor_idx" ON "estoque_setor"("setor");

-- CreateIndex
CREATE INDEX "estoque_setor_item_inventario_id_idx" ON "estoque_setor"("item_inventario_id");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_setor_item_inventario_id_setor_key" ON "estoque_setor"("item_inventario_id", "setor");

-- AddForeignKey
ALTER TABLE "estoque_setor" ADD CONSTRAINT "estoque_setor_item_inventario_id_fkey" FOREIGN KEY ("item_inventario_id") REFERENCES "itens_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
