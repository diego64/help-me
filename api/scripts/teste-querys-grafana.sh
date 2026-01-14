#!/bin/bash
# test-grafana-queries-docker.sh

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Credenciais do PostgreSQL
DB_USER="administrador"
DB_PASSWORD="1qaz2wsx3edc"
DB_NAME="helpme-database"

echo -e "${BLUE}"
echo "════════════════════════════════════════════════════════════"
echo "   TESTE DE QUERIES DO GRAFANA - HELP-ME API"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"

# Verificar se o container está rodando
if ! docker-compose ps postgresql_helpme | grep -q "Up"; then
    echo -e "${RED}✗ Container postgresql_helpme não está rodando!${NC}"
    echo -e "${YELLOW}Execute: docker-compose up -d postgresql_helpme${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Container postgresql_helpme está rodando${NC}"
echo -e "${CYAN}Credenciais: ${DB_USER}@${DB_NAME}${NC}\n"

# Executar queries usando variável de ambiente dentro do docker exec
docker-compose exec -T -e PGPASSWORD="$DB_PASSWORD" postgresql_helpme psql -U "$DB_USER" -d "$DB_NAME" << 'EOF'

\timing on
\pset border 2

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '1. TOTAL DE CHAMADOS (sem filtro de data)'
\echo '──────────────────────────────────────────────────────────────'
SELECT COUNT(*) as "Total de Chamados" 
FROM chamados 
WHERE deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '2. TOTAL DE CHAMADOS (últimos 30 dias)'
\echo '──────────────────────────────────────────────────────────────'
SELECT COUNT(*) as "Total (30 dias)" 
FROM chamados 
WHERE gerado_em >= NOW() - INTERVAL '30 days'
  AND gerado_em <= NOW()
  AND deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '3. RANGE DE DATAS NA TABELA'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  TO_CHAR(MIN(gerado_em) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as "Data Mais Antiga",
  TO_CHAR(MAX(gerado_em) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as "Data Mais Recente",
  COUNT(*) as "Total de Registros"
FROM chamados 
WHERE deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '4. CHAMADOS POR STATUS'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  status as "Status",
  COUNT(*) as "Quantidade",
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as "Percentual (%)"
FROM chamados 
WHERE deletado_em IS NULL
GROUP BY status
ORDER BY "Quantidade" DESC;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '5. QUERY DO GRAFANA COM TIMESTAMPTZ'
\echo '──────────────────────────────────────────────────────────────'
SELECT COUNT(*) as "Total (com cast)" 
FROM chamados 
WHERE gerado_em >= (NOW() - INTERVAL '30 days')::timestamptz
  AND gerado_em <= NOW()::timestamptz
  AND deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '6. CHAMADOS ENCERRADOS (para cálculo de SLA)'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  COUNT(*) as "Total Encerrados",
  COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600 <= 24) as "Dentro SLA 24h",
  ROUND(
    COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600 <= 24)::numeric 
    / NULLIF(COUNT(*), 0) * 100, 
    2
  ) as "% SLA 24h"
FROM chamados 
WHERE encerrado_em IS NOT NULL
  AND deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '7. EVOLUÇÃO TEMPORAL (últimos 7 dias)'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  TO_CHAR(DATE_TRUNC('day', gerado_em AT TIME ZONE 'America/Sao_Paulo'), 'DD/MM/YYYY') as "Dia",
  status as "Status",
  COUNT(*) as "Quantidade"
FROM chamados 
WHERE gerado_em >= NOW() - INTERVAL '7 days'
  AND gerado_em <= NOW()
  AND deletado_em IS NULL
GROUP BY DATE_TRUNC('day', gerado_em AT TIME ZONE 'America/Sao_Paulo'), status
ORDER BY DATE_TRUNC('day', gerado_em AT TIME ZONE 'America/Sao_Paulo') ASC, status
LIMIT 20;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '8. ESTRUTURA DA TABELA CHAMADOS'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  column_name as "Coluna",
  data_type as "Tipo",
  is_nullable as "Nullable"
FROM information_schema.columns
WHERE table_name = 'chamados'
  AND table_schema = 'public'
ORDER BY ordinal_position;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '9. CONFIGURAÇÃO DE TIMEZONE DO BANCO'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  name as "Configuração",
  setting as "Valor"
FROM pg_settings 
WHERE name IN ('timezone', 'log_timezone');

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '10. TESTE COM BETWEEN (sintaxe Grafana)'
\echo '──────────────────────────────────────────────────────────────'
SELECT COUNT(*) as "Total (BETWEEN)"
FROM chamados 
WHERE gerado_em BETWEEN (NOW() - INTERVAL '30 days') AND NOW()
  AND deletado_em IS NULL;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '11. STATUS DE SOFT DELETE'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  COUNT(*) FILTER (WHERE deletado_em IS NULL) as "Registros Ativos",
  COUNT(*) FILTER (WHERE deletado_em IS NOT NULL) as "Registros Deletados",
  COUNT(*) as "Total Geral"
FROM chamados;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '12. ÚLTIMOS 5 CHAMADOS CRIADOS'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  id as "ID",
  "OS" as "OS",
  status as "Status",
  TO_CHAR(gerado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as "Criado Em",
  CASE 
    WHEN deletado_em IS NULL THEN 'ATIVO'
    ELSE 'DELETADO'
  END as "Estado"
FROM chamados 
ORDER BY gerado_em DESC
LIMIT 5;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '13. ÍNDICES NA TABELA CHAMADOS'
\echo '──────────────────────────────────────────────────────────────'
SELECT
  indexname as "Nome do Índice",
  indexdef as "Definição"
FROM pg_indexes
WHERE tablename = 'chamados'
  AND schemaname = 'public';

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '14. CHAMADOS VENCIDOS (> 24h sem resolução)'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  COUNT(*) as "Total Vencidos",
  status as "Status"
FROM chamados 
WHERE status IN ('ABERTO', 'EM_ATENDIMENTO')
  AND EXTRACT(EPOCH FROM (NOW() - gerado_em)) / 3600 > 24
  AND deletado_em IS NULL
GROUP BY status;

\echo ''
\echo '──────────────────────────────────────────────────────────────'
\echo '15. TEMPO MÉDIO DE RESOLUÇÃO'
\echo '──────────────────────────────────────────────────────────────'
SELECT 
  ROUND(AVG(EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600)::numeric, 1) as "Tempo Médio (horas)",
  ROUND(MIN(EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600)::numeric, 1) as "Menor Tempo (horas)",
  ROUND(MAX(EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600)::numeric, 1) as "Maior Tempo (horas)"
FROM chamados 
WHERE encerrado_em IS NOT NULL
  AND deletado_em IS NULL;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo 'TESTES CONCLUÍDOS'
\echo '══════════════════════════════════════════════════════════════'
\echo ''

EOF

# Capturar o código de saída
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Todos os testes foram executados com sucesso!${NC}"
    echo -e "${CYAN}Próximos passos:${NC}"
    echo -e "  1. Verifique se há dados na tabela"
    echo -e "  2. Compare os resultados com o que aparece no Grafana"
    echo -e "  3. Se não houver dados, execute o seed: npm run seed"
else
    echo -e "${RED}✗ Houve erros durante a execução dos testes${NC}"
    exit 1
fi