-- AlterTable
ALTER TABLE "chamados" ADD COLUMN     "chamado_pai_id" TEXT,
ADD COLUMN     "vinculado_em" TIMESTAMPTZ(3),
ADD COLUMN     "vinculado_por" TEXT;

-- CreateIndex
CREATE INDEX "chamados_chamado_pai_id_idx" ON "chamados"("chamado_pai_id");

-- CreateIndex
CREATE INDEX "chamados_vinculado_por_idx" ON "chamados"("vinculado_por");

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_chamado_pai_id_fkey" FOREIGN KEY ("chamado_pai_id") REFERENCES "chamados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_vinculado_por_fkey" FOREIGN KEY ("vinculado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
