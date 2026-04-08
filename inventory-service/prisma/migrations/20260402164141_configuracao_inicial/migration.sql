-- CreateEnum
CREATE TYPE "Regra" AS ENUM ('ADMIN', 'COMPRADOR', 'GESTOR', 'INVENTARIANTE', 'TECNICO', 'USUARIO');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoCompra" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'COMPRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusReembolso" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'PAGO');

-- CreateEnum
CREATE TYPE "StatusBaixa" AS ENUM ('PENDENTE', 'APROVADO_TECNICO', 'APROVADO_GESTOR', 'CONCLUIDO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "MotivoMovimentacao" AS ENUM ('COMPRA', 'ENTRADA_MANUAL', 'BAIXA', 'AJUSTE');

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" VARCHAR(512),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "cnpj" VARCHAR(18),
    "email" VARCHAR(255),
    "telefone" VARCHAR(20),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_inventario" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "descricao" VARCHAR(512),
    "unidade" VARCHAR(20) NOT NULL,
    "estoque_atual" INTEGER NOT NULL DEFAULT 0,
    "estoque_minimo" INTEGER NOT NULL DEFAULT 0,
    "categoria_id" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "itens_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "motivo" "MotivoMovimentacao" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "estoque_before" INTEGER NOT NULL,
    "estoque_after" INTEGER NOT NULL,
    "referencia_id" TEXT,
    "realizado_por" TEXT NOT NULL,
    "observacoes" VARCHAR(512),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_compra" (
    "id" TEXT NOT NULL,
    "solicitado_por" TEXT NOT NULL,
    "fornecedor_id" TEXT,
    "status" "StatusSolicitacaoCompra" NOT NULL DEFAULT 'PENDENTE',
    "justificativa" VARCHAR(512),
    "aprovado_por" TEXT,
    "aprovado_em" TIMESTAMPTZ(3),
    "rejeitado_por" TEXT,
    "rejeitado_em" TIMESTAMPTZ(3),
    "motivo_rejeicao" VARCHAR(512),
    "executado_por" TEXT,
    "executado_em" TIMESTAMPTZ(3),
    "valor_total" DECIMAL(10,2),
    "observacoes" VARCHAR(512),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "solicitacoes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_solicitacao_compra" (
    "id" TEXT NOT NULL,
    "solicitacao_compra_id" TEXT NOT NULL,
    "item_inventario_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_estimado" DECIMAL(10,2),
    "preco_real" DECIMAL(10,2),

    CONSTRAINT "itens_solicitacao_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reembolsos" (
    "id" TEXT NOT NULL,
    "solicitado_por" TEXT NOT NULL,
    "solicitacao_compra_id" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" VARCHAR(512) NOT NULL,
    "url_comprovante" VARCHAR(512),
    "status" "StatusReembolso" NOT NULL DEFAULT 'PENDENTE',
    "aprovado_por" TEXT,
    "aprovado_em" TIMESTAMPTZ(3),
    "rejeitado_por" TEXT,
    "rejeitado_em" TIMESTAMPTZ(3),
    "motivo_rejeicao" VARCHAR(512),
    "processado_por" TEXT,
    "processado_em" TIMESTAMPTZ(3),
    "observacoes" VARCHAR(512),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reembolsos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baixas" (
    "id" TEXT NOT NULL,
    "solicitado_por" TEXT NOT NULL,
    "perfil_solicitante" "Regra" NOT NULL,
    "status" "StatusBaixa" NOT NULL DEFAULT 'PENDENTE',
    "justificativa" VARCHAR(512) NOT NULL,
    "aprovado_tecnico_por" TEXT,
    "aprovado_tecnico_em" TIMESTAMPTZ(3),
    "aprovado_gestor_por" TEXT,
    "aprovado_gestor_em" TIMESTAMPTZ(3),
    "rejeitado_por" TEXT,
    "rejeitado_em" TIMESTAMPTZ(3),
    "motivo_rejeicao" VARCHAR(512),
    "executado_por" TEXT,
    "executado_em" TIMESTAMPTZ(3),
    "observacoes" VARCHAR(512),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "baixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_baixa" (
    "id" TEXT NOT NULL,
    "baixa_id" TEXT NOT NULL,
    "item_inventario_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "motivo" VARCHAR(255),

    CONSTRAINT "itens_baixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_cnpj_key" ON "fornecedores"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "itens_inventario_sku_key" ON "itens_inventario"("sku");

-- CreateIndex
CREATE INDEX "itens_inventario_categoria_id_idx" ON "itens_inventario"("categoria_id");

-- CreateIndex
CREATE INDEX "itens_inventario_sku_idx" ON "itens_inventario"("sku");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_item_id_idx" ON "movimentacoes_estoque"("item_id");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_referencia_id_idx" ON "movimentacoes_estoque"("referencia_id");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_criado_em_idx" ON "movimentacoes_estoque"("criado_em");

-- CreateIndex
CREATE INDEX "solicitacoes_compra_solicitado_por_idx" ON "solicitacoes_compra"("solicitado_por");

-- CreateIndex
CREATE INDEX "solicitacoes_compra_status_idx" ON "solicitacoes_compra"("status");

-- CreateIndex
CREATE INDEX "solicitacoes_compra_criado_em_idx" ON "solicitacoes_compra"("criado_em");

-- CreateIndex
CREATE INDEX "itens_solicitacao_compra_solicitacao_compra_id_idx" ON "itens_solicitacao_compra"("solicitacao_compra_id");

-- CreateIndex
CREATE INDEX "itens_solicitacao_compra_item_inventario_id_idx" ON "itens_solicitacao_compra"("item_inventario_id");

-- CreateIndex
CREATE UNIQUE INDEX "reembolsos_solicitacao_compra_id_key" ON "reembolsos"("solicitacao_compra_id");

-- CreateIndex
CREATE INDEX "reembolsos_solicitado_por_idx" ON "reembolsos"("solicitado_por");

-- CreateIndex
CREATE INDEX "reembolsos_status_idx" ON "reembolsos"("status");

-- CreateIndex
CREATE INDEX "reembolsos_criado_em_idx" ON "reembolsos"("criado_em");

-- CreateIndex
CREATE INDEX "baixas_solicitado_por_idx" ON "baixas"("solicitado_por");

-- CreateIndex
CREATE INDEX "baixas_status_idx" ON "baixas"("status");

-- CreateIndex
CREATE INDEX "baixas_criado_em_idx" ON "baixas"("criado_em");

-- CreateIndex
CREATE INDEX "itens_baixa_baixa_id_idx" ON "itens_baixa"("baixa_id");

-- CreateIndex
CREATE INDEX "itens_baixa_item_inventario_id_idx" ON "itens_baixa"("item_inventario_id");

-- AddForeignKey
ALTER TABLE "itens_inventario" ADD CONSTRAINT "itens_inventario_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_compra" ADD CONSTRAINT "solicitacoes_compra_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_solicitacao_compra" ADD CONSTRAINT "itens_solicitacao_compra_solicitacao_compra_id_fkey" FOREIGN KEY ("solicitacao_compra_id") REFERENCES "solicitacoes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_solicitacao_compra" ADD CONSTRAINT "itens_solicitacao_compra_item_inventario_id_fkey" FOREIGN KEY ("item_inventario_id") REFERENCES "itens_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_solicitacao_compra_id_fkey" FOREIGN KEY ("solicitacao_compra_id") REFERENCES "solicitacoes_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_baixa" ADD CONSTRAINT "itens_baixa_baixa_id_fkey" FOREIGN KEY ("baixa_id") REFERENCES "baixas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_baixa" ADD CONSTRAINT "itens_baixa_item_inventario_id_fkey" FOREIGN KEY ("item_inventario_id") REFERENCES "itens_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
