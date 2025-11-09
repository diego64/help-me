-- DropForeignKey
ALTER TABLE "public"."Expediente" DROP CONSTRAINT "Expediente_usuarioId_fkey";

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
