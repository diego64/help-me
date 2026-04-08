-- AlterEnum: adiciona novos perfis de usuário
-- ALTER TYPE ADD VALUE não pode rodar dentro de uma transaction no PostgreSQL
ALTER TYPE "Regra" ADD VALUE IF NOT EXISTS 'COMPRADOR';
ALTER TYPE "Regra" ADD VALUE IF NOT EXISTS 'GESTOR';
ALTER TYPE "Regra" ADD VALUE IF NOT EXISTS 'INVENTARIANTE';
