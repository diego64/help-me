#!/bin/bash

set -e

echo "=== Configurando Datasource do PostgreSQL no Grafana ==="

# Credenciais do Grafana (padrão: admin/admin)
GRAFANA_URL="http://localhost:3001"
GRAFANA_USER="admin"
GRAFANA_PASS="admin"

# Verificar se o Grafana está rodando
if ! docker ps | grep -q "grafana_helpme"; then
    echo "✗ Container grafana_helpme não está rodando!"
    exit 1
fi

echo "[INFO] Grafana está rodando"

echo ""
echo "Aguardando Grafana iniciar completamente..."
MAX_ATTEMPTS=30
ATTEMPT=0

until curl -s -f -o /dev/null "$GRAFANA_URL/api/health"; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
        echo "✗ Timeout aguardando Grafana"
        exit 1
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "✓ Grafana está online"

echo ""
echo "Removendo datasource antigo (se existir)..."
curl -s -X DELETE "$GRAFANA_URL/api/datasources/name/PostgreSQL-HelpMe" \
  -u "$GRAFANA_USER:$GRAFANA_PASS" > /dev/null 2>&1 || true

echo ""
echo "Criando datasource PostgreSQL..."

RESPONSE=$(curl -s -X POST "$GRAFANA_URL/api/datasources" \
  -H "Content-Type: application/json" \
  -u "$GRAFANA_USER:$GRAFANA_PASS" \
  -d '{
    "name": "PostgreSQL-HelpMe",
    "type": "postgres",
    "access": "proxy",
    "url": "postgresql_helpme:5432",
    "database": "helpme-database",
    "user": "administrador",
    "secureJsonData": {
      "password": "1qaz2wsx3edc"
    },
    "jsonData": {
      "sslmode": "disable",
      "postgresVersion": 1400,
      "timescaledb": false,
      "maxOpenConns": 10,
      "maxIdleConns": 2,
      "connMaxLifetime": 14400
    },
    "isDefault": true
  }')

echo "$RESPONSE"

if echo "$RESPONSE" | grep -q '"id"'; then
    echo ""
    echo "[INFO] Datasource criado com sucesso!"
    
    DATASOURCE_ID=$(echo "$RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
    
    echo ""
    echo "[INFO] Testando conexão do datasource..."
    sleep 2
    
    TEST_RESPONSE=$(curl -s -X GET "$GRAFANA_URL/api/datasources/$DATASOURCE_ID" \
      -u "$GRAFANA_USER:$GRAFANA_PASS")
    
    echo "$TEST_RESPONSE" | jq . 2>/dev/null || echo "$TEST_RESPONSE"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "[INFO] Configuração concluída!"
    echo ""
    echo "Próximos passos:"
    echo "  1. Acesse: $GRAFANA_URL"
    echo "  2. Login: $GRAFANA_USER / $GRAFANA_PASS"
    echo "  3. Vá em: Configuration → Data Sources → PostgreSQL-HelpMe"
    echo "  4. Clique em 'Save & Test' para verificar a conexão"
    echo "  5. Importe o dashboard JSON fornecido"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "[INFO] Erro ao criar datasource"
    echo "Resposta: $RESPONSE"
    exit 1
fi