-- AlterTable: adiciona setor_solicitante em solicitacoes_compra
-- Usado para rotear a aprovação ao gestor do setor correto
ALTER TABLE "solicitacoes_compra" ADD COLUMN "setor_solicitante" VARCHAR(50);
