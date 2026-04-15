-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'DEBITO', 'BOLETO', 'CARTAO_CREDITO');

-- AlterTable
ALTER TABLE "solicitacoes_compra" ADD COLUMN     "forma_pagamento" "FormaPagamento",
ADD COLUMN     "parcelas" INTEGER;
