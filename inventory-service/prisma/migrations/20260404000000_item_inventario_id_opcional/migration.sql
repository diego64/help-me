-- AlterTable: torna item_inventario_id opcional e adiciona nome_produto em itens_solicitacao_compra
-- Motivo: solicitação de compra pode ser criada para itens que ainda não existem no inventário

-- DropForeignKey
ALTER TABLE "itens_solicitacao_compra" DROP CONSTRAINT IF EXISTS "itens_solicitacao_compra_item_inventario_id_fkey";

-- AlterTable
ALTER TABLE "itens_solicitacao_compra"
  ALTER COLUMN "item_inventario_id" DROP NOT NULL,
  ADD COLUMN "nome_produto" VARCHAR(255) NOT NULL DEFAULT '';

-- Remover o DEFAULT após a adição (evitar valor padrão permanente)
ALTER TABLE "itens_solicitacao_compra" ALTER COLUMN "nome_produto" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "itens_solicitacao_compra" ADD CONSTRAINT "itens_solicitacao_compra_item_inventario_id_fkey"
  FOREIGN KEY ("item_inventario_id") REFERENCES "itens_inventario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
