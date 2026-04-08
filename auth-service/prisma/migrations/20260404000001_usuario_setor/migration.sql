-- AlterTable: adiciona setor ao usuario para ser incluído no JWT
ALTER TABLE "usuarios" ADD COLUMN "setor" VARCHAR(50);
