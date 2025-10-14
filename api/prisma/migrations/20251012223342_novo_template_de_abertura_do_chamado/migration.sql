/*
  Warnings:

  - A unique constraint covering the columns `[osNumber]` on the table `Chamado` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `osNumber` to the `Chamado` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Chamado" DROP CONSTRAINT "Chamado_tecnicoId_fkey";

-- AlterTable
ALTER TABLE "Chamado" ADD COLUMN     "closedIn" TIMESTAMP(3),
ADD COLUMN     "osNumber" TEXT NOT NULL,
ALTER COLUMN "tecnicoId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_osNumber_key" ON "Chamado"("osNumber");

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
