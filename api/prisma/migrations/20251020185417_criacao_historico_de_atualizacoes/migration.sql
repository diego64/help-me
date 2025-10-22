-- CreateTable
CREATE TABLE "ChamadoAtualizacao" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "descricao" TEXT,
    "autorId" TEXT NOT NULL,

    CONSTRAINT "ChamadoAtualizacao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChamadoAtualizacao" ADD CONSTRAINT "ChamadoAtualizacao_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoAtualizacao" ADD CONSTRAINT "ChamadoAtualizacao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
