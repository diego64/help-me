#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# ============================================
# Teste com Visualização em Tempo Real
# ============================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
INFLUXDB_URL="http://localhost:8086"
INFLUXDB_TOKEN="${INFLUXDB_TOKEN:-my-super-secret-auth-token}"
INFLUXDB_ORG="k6-org"
INFLUXDB_BUCKET="k6"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Teste de Performance com Visualização em Tempo Real ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Verificar se InfluxDB está rodando
echo -e "${YELLOW}[1/5] Verificando InfluxDB...${NC}"

if ! docker ps | grep -q "influxdb_k6_helpme"; then
    echo -e "${YELLOW}[INFO]  InfluxDB não está rodando. Iniciando...${NC}"
    docker-compose up -d influxdb_k6
    sleep 5
fi

if curl -s -f -o /dev/null "$INFLUXDB_URL/health"; then
    echo -e "${GREEN}[SUCESSO] InfluxDB está rodando${NC}"
else
    echo -e "${YELLOW}[ERROR] Erro: InfluxDB não está acessível${NC}"
    exit 1
fi

# 2. Verificar se Grafana está rodando
echo ""
echo -e "${YELLOW}[2/5] Verificando Grafana...${NC}"

if ! docker ps | grep -q "grafana_k6_helpme"; then
    echo -e "${YELLOW}[INFO]  Grafana não está rodando. Iniciando...${NC}"
    docker-compose up -d grafana_k6
    sleep 5
fi

if curl -s -f -o /dev/null "http://localhost:3001/api/health"; then
    echo -e "${GREEN}[SUCESSO] Grafana está rodando${NC}"
else
    echo -e "${YELLOW}[ERROR] Erro: Grafana não está acessível${NC}"
    exit 1
fi

# 3. Configurar datasource do InfluxDB no Grafana (se necessário)
echo ""
echo -e "${YELLOW}[3/5] Configurando Grafana...${NC}"

# Criar datasource via API do Grafana
curl -s -X POST http://localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "InfluxDB-K6",
    "type": "influxdb",
    "url": "'"$INFLUXDB_URL"'",
    "access": "proxy",
    "basicAuth": false,
    "jsonData": {
      "version": "Flux",
      "organization": "'"$INFLUXDB_ORG"'",
      "defaultBucket": "'"$INFLUXDB_BUCKET"'",
      "tlsSkipVerify": true
    },
    "secureJsonData": {
      "token": "'"$INFLUXDB_TOKEN"'"
    }
  }' > /dev/null 2>&1 || true

echo -e "${GREEN}[SUCESSO] Datasource configurado${NC}"

# 4. Verificar API
echo ""
echo -e "${YELLOW}[4/5] Verificando API...${NC}"

if curl -s -f -o /dev/null "$API_BASE_URL/auth/login"; then
    echo -e "${GREEN}[SUCESSO] API está acessível${NC}"
else
    echo -e "${YELLOW}[ERROR] Erro: API não está acessível em $API_BASE_URL${NC}"
    exit 1
fi

# 5. Executar teste
echo ""
echo -e "${YELLOW}[5/5] Executando teste...${NC}"
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Teste iniciado!                                      ║${NC}"
echo -e "${BLUE}║  Acesse o Grafana para visualização em tempo real:   ║${NC}"
echo -e "${BLUE}║  ${GREEN}http://localhost:3001${BLUE}                                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Aguardar 3 segundos antes de abrir o browser
sleep 3

# Tentar abrir o Grafana automaticamente
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3001" &
elif command -v open &> /dev/null; then
    open "http://localhost:3001" &
fi

# Executar teste com output para InfluxDB
k6 run \
    --out influxdb="$INFLUXDB_URL?org=$INFLUXDB_ORG&bucket=$INFLUXDB_BUCKET&token=$INFLUXDB_TOKEN" \
    --out json=results/realtime-$(date +%Y%m%d_%H%M%S).json \
    -e API_BASE_URL="$API_BASE_URL" \
    -e MIN_VUS=1 \
    -e NORMAL_VUS=5 \
    -e PEAK_VUS=10 \
    -e MAX_VUS=15 \
    -e WARMUP_DURATION=1m \
    -e NORMAL_DURATION=3m \
    -e PEAK_DURATION=2m \
    -e COOLDOWN_DURATION=1m \
    src/__tests__/performance/$BASE_DIR/$BASE_DIR/$BASE_DIR/carga/carga.js

echo ""
echo -e "${GREEN}[SUCESSO] Teste concluído!${NC}"
echo ""
echo -e "${BLUE}Dashboard Grafana:${NC} http://localhost:3001"
echo -e "${BLUE}InfluxDB UI:${NC} http://localhost:8086"
echo ""