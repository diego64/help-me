#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════"
echo "   DIAGNÓSTICO COMPLETO DO GRAFANA - HELP-ME API"
echo "════════════════════════════════════════════════════════════"

DB_USER="administrador"
DB_PASSWORD="1qaz2wsx3edc"
DB_NAME="helpme-database"
GRAFANA_URL="http://localhost:3001"
GRAFANA_USER="admin"
GRAFANA_PASS="admin"

echo ""
echo "1. Testando conexão PostgreSQL do host..."
PGPASSWORD="$DB_PASSWORD" docker exec -i -e PGPASSWORD="$DB_PASSWORD" postgresql_helpme \
  psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT COUNT(*) as total FROM chamados WHERE deletado_em IS NULL;"

echo ""
echo "2. Testando conexão de dentro do Grafana para PostgreSQL..."
docker exec grafana_helpme sh -c "
  echo 'Testando resolução DNS:'
  getent hosts postgresql_helpme 2>&1 || nslookup postgresql_helpme 2>&1 || echo 'DNS não funcionou'
  echo ''
  echo 'Testando conectividade TCP (se nc existir):'
  nc -zv postgresql_helpme 5432 2>&1 || echo 'nc não disponível ou porta inacessível'
"

echo ""
echo "3. Listando datasources configurados..."
curl -s -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/datasources" | jq '.[] | {id, uid, name, type, url}'

echo ""
echo "4. Testando saúde do datasource PostgreSQL-HelpMe..."
HEALTH=$(curl -s -X GET -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/datasources/uid/da8cb6b0-c457-46ac-8930-ec1514edd543/health")

echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"

if echo "$HEALTH" | grep -q '"status":"OK"'; then
    echo "[SUCESSO]Datasource conectado com sucesso!"
else
    echo "[ERROR] Problema na conexão do datasource"
fi

echo ""
echo "5. Detalhes completos do datasource..."
curl -s -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/datasources/uid/da8cb6b0-c457-46ac-8930-ec1514edd543" | jq .

echo ""
echo "6. Testando query simples via API..."
QUERY_RESULT=$(curl -s -X POST -u "$GRAFANA_USER:$GRAFANA_PASS" \
  -H "Content-Type: application/json" \
  "$GRAFANA_URL/api/ds/query" \
  -d '{
    "queries": [
      {
        "refId": "A",
        "datasource": {
          "type": "grafana-postgresql-datasource",
          "uid": "da8cb6b0-c457-46ac-8930-ec1514edd543"
        },
        "rawSql": "SELECT COUNT(*) as total FROM chamados WHERE deletado_em IS NULL",
        "format": "table"
      }
    ],
    "from": "now-1h",
    "to": "now"
  }')

echo "$QUERY_RESULT" | jq . 2>/dev/null || echo "$QUERY_RESULT"

if echo "$QUERY_RESULT" | grep -q '"total"'; then
    echo "[SUCESSO] Query simples funcionou!"
else
    echo "[ERROR]  Query simples falhou"
fi

echo ""
echo "7. Testando query com filtro de data (30 dias)..."
QUERY_TIME=$(curl -s -X POST -u "$GRAFANA_USER:$GRAFANA_PASS" \
  -H "Content-Type: application/json" \
  "$GRAFANA_URL/api/ds/query" \
  -d '{
    "queries": [
      {
        "refId": "A",
        "datasource": {
          "type": "grafana-postgresql-datasource",
          "uid": "da8cb6b0-c457-46ac-8930-ec1514edd543"
        },
        "rawSql": "SELECT COUNT(*) as total FROM chamados WHERE gerado_em >= NOW() - INTERVAL '\''30 days'\'' AND deletado_em IS NULL",
        "format": "table"
      }
    ],
    "from": "now-30d",
    "to": "now"
  }')

echo "$QUERY_TIME" | jq . 2>/dev/null || echo "$QUERY_TIME"

if echo "$QUERY_TIME" | grep -q '"total"'; then
    echo "[SUCESSO] Query com filtro de data funcionou!"
else
    echo "[ERROR] Query com filtro de data falhou"
fi

echo ""
echo "8. Logs do Grafana (erros recentes)..."
docker logs --tail 50 grafana_helpme 2>&1 | grep -i "error\|warn\|fail" | tail -20 || echo "[SUCESSO] Nenhum erro encontrado"

echo ""
echo "9. Verificando rede Docker..."
echo "Rede do Grafana:"
docker inspect grafana_helpme | jq '.[0].NetworkSettings.Networks'

echo ""
echo "Rede do PostgreSQL:"
docker inspect postgresql_helpme | jq '.[0].NetworkSettings.Networks'

echo ""
echo "════════════════════════════════════════════════════════════"
echo "   CONCLUSÃO"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Se todos os testes passaram mas o dashboard não carrega:"
echo "  → O problema está nas queries do dashboard (macros ou sintaxe)"
echo "  → Solução: Use o dashboard sem macros (create-working-dashboard.sh)"
echo ""
echo "Se o teste de saúde falhou:"
echo "  → Execute: ./correcao-grafana.sh"
echo ""