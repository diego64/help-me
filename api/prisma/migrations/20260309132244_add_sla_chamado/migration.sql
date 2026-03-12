-- AlterTable
ALTER TABLE "chamados" ADD COLUMN     "sla_deadline" TIMESTAMPTZ(3),
ADD COLUMN     "sla_violado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sla_violado_em" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "chamados_sla_deadline_idx" ON "chamados"("sla_deadline");

-- CreateIndex
CREATE INDEX "chamados_sla_violado_idx" ON "chamados"("sla_violado");

-- CreateIndex
CREATE INDEX "chamados_sla_violado_status_idx" ON "chamados"("sla_violado", "status");
