-- CreateEnum
CREATE TYPE "PrioridadeChamado" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- AlterTable
ALTER TABLE "chamados" ADD COLUMN     "prioridade" "PrioridadeChamado" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "prioridade_alterada" TIMESTAMPTZ(3),
ADD COLUMN     "prioridade_alterada_por" TEXT;

-- CreateTable
CREATE TABLE "transferencias_chamado" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "tecnico_anterior_id" TEXT,
    "tecnico_novo_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "transferido_por" TEXT NOT NULL,
    "transferido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencias_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios_chamado" (
    "id" TEXT NOT NULL,
    "chamado_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "visibilidade_interna" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "deletado_em" TIMESTAMPTZ(3),

    CONSTRAINT "comentarios_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transferencias_chamado_chamado_id_idx" ON "transferencias_chamado"("chamado_id");

-- CreateIndex
CREATE INDEX "transferencias_chamado_tecnico_anterior_id_idx" ON "transferencias_chamado"("tecnico_anterior_id");

-- CreateIndex
CREATE INDEX "transferencias_chamado_tecnico_novo_id_idx" ON "transferencias_chamado"("tecnico_novo_id");

-- CreateIndex
CREATE INDEX "transferencias_chamado_transferido_por_idx" ON "transferencias_chamado"("transferido_por");

-- CreateIndex
CREATE INDEX "transferencias_chamado_transferido_em_idx" ON "transferencias_chamado"("transferido_em");

-- CreateIndex
CREATE INDEX "comentarios_chamado_chamado_id_idx" ON "comentarios_chamado"("chamado_id");

-- CreateIndex
CREATE INDEX "comentarios_chamado_autor_id_idx" ON "comentarios_chamado"("autor_id");

-- CreateIndex
CREATE INDEX "comentarios_chamado_criado_em_idx" ON "comentarios_chamado"("criado_em");

-- CreateIndex
CREATE INDEX "comentarios_chamado_deletado_em_idx" ON "comentarios_chamado"("deletado_em");

-- CreateIndex
CREATE INDEX "comentarios_chamado_chamado_id_deletado_em_idx" ON "comentarios_chamado"("chamado_id", "deletado_em");

-- CreateIndex
CREATE INDEX "comentarios_chamado_visibilidade_interna_idx" ON "comentarios_chamado"("visibilidade_interna");

-- CreateIndex
CREATE INDEX "chamados_prioridade_idx" ON "chamados"("prioridade");

-- CreateIndex
CREATE INDEX "chamados_prioridade_status_idx" ON "chamados"("prioridade", "status");

-- CreateIndex
CREATE INDEX "chamados_status_prioridade_gerado_em_idx" ON "chamados"("status", "prioridade", "gerado_em");

-- CreateIndex
CREATE INDEX "chamados_prioridade_alterada_por_idx" ON "chamados"("prioridade_alterada_por");

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_prioridade_alterada_por_fkey" FOREIGN KEY ("prioridade_alterada_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_chamado" ADD CONSTRAINT "transferencias_chamado_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_chamado" ADD CONSTRAINT "transferencias_chamado_tecnico_anterior_id_fkey" FOREIGN KEY ("tecnico_anterior_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_chamado" ADD CONSTRAINT "transferencias_chamado_tecnico_novo_id_fkey" FOREIGN KEY ("tecnico_novo_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_chamado" ADD CONSTRAINT "transferencias_chamado_transferido_por_fkey" FOREIGN KEY ("transferido_por") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_chamado" ADD CONSTRAINT "comentarios_chamado_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_chamado" ADD CONSTRAINT "comentarios_chamado_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
