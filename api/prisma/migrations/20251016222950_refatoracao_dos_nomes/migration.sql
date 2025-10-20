/*
  Warnings:

  - You are about to drop the column `closedIn` on the `Chamado` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Chamado` table. All the data in the column will be lost.
  - You are about to drop the column `osNumber` on the `Chamado` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Chamado` table. All the data in the column will be lost.
  - You are about to drop the `ChamadoService` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Service` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TimeSlot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[OS]` on the table `Chamado` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `OS` to the `Chamado` table without a default value. This is not possible if the table is not empty.
  - Added the required column `atualizadoEm` to the `Chamado` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Regra" AS ENUM ('ADMIN', 'TECNICO', 'USUARIO');

-- CreateEnum
CREATE TYPE "Setor" AS ENUM ('ADMINISTRACAO', 'ALMOXARIFADO', 'CALL_CENTER', 'COMERCIAL', 'DEPARTAMENTO_PESSOAL', 'FINANCEIRO', 'JURIDICO', 'LOGISTICA', 'MARKETING', 'QUALIDADE', 'RECURSOS_HUMANOS', 'TECNOLOGIA_INFORMACAO');

-- DropForeignKey
ALTER TABLE "public"."Chamado" DROP CONSTRAINT "Chamado_tecnicoId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Chamado" DROP CONSTRAINT "Chamado_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChamadoService" DROP CONSTRAINT "ChamadoService_chamadoId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChamadoService" DROP CONSTRAINT "ChamadoService_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TimeSlot" DROP CONSTRAINT "TimeSlot_userId_fkey";

-- DropIndex
DROP INDEX "public"."Chamado_osNumber_key";

-- AlterTable
ALTER TABLE "Chamado" DROP COLUMN "closedIn",
DROP COLUMN "createdAt",
DROP COLUMN "osNumber",
DROP COLUMN "updatedAt",
ADD COLUMN     "OS" TEXT NOT NULL,
ADD COLUMN     "atualizadoEm" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "encerradoEm" TIMESTAMP(3),
ADD COLUMN     "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "public"."ChamadoService";

-- DropTable
DROP TABLE "public"."Service";

-- DropTable
DROP TABLE "public"."TimeSlot";

-- DropTable
DROP TABLE "public"."User";

-- DropEnum
DROP TYPE "public"."Role";

-- DropEnum
DROP TYPE "public"."Sector";

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sobrenome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "regra" "Regra" NOT NULL,
    "setor" "Setor",
    "telefone" TEXT,
    "ramal" TEXT,
    "avatarUrl" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "refreshToken" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expediente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "Expediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeServico" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,

    CONSTRAINT "OrdemDeServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_nome_key" ON "Servico"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_OS_key" ON "Chamado"("OS");

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeServico" ADD CONSTRAINT "OrdemDeServico_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeServico" ADD CONSTRAINT "OrdemDeServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
