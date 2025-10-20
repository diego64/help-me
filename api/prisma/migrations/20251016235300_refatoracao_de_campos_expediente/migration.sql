/*
  Warnings:

  - You are about to drop the column `end` on the `Expediente` table. All the data in the column will be lost.
  - You are about to drop the column `start` on the `Expediente` table. All the data in the column will be lost.
  - Added the required column `entrada` to the `Expediente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `saida` to the `Expediente` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expediente" DROP COLUMN "end",
DROP COLUMN "start",
ADD COLUMN     "entrada" TEXT NOT NULL,
ADD COLUMN     "saida" TEXT NOT NULL;
