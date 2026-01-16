/*
  Warnings:

  - Changed the type of `entrada` on the `expedientes` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `saida` on the `expedientes` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "expedientes" DROP COLUMN "entrada",
ADD COLUMN     "entrada" TIMESTAMPTZ(3) NOT NULL,
DROP COLUMN "saida",
ADD COLUMN     "saida" TIMESTAMPTZ(3) NOT NULL;
