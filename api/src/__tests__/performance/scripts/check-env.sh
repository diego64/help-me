#!/bin/bash

# ============================================
# Verificador de Ambiente - Help-Me API
# (Versão corrigida para pasta scripts/)
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Verificador de Ambiente                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ====== DETECTAR DIRETÓRIOS (CRÍTICO!) ======
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"  # Volta para performance/

# Debug (remover depois se quiser)
# echo "DEBUG: SCRIPT_DIR = $SCRIPT_DIR"
# echo "DEBUG: BASE_DIR = $BASE_DIR"

# ====== VARIÁVEIS ======
API_CONTAINER_NAME="helpme-api"
API_PORT_HOST="3000"
API_PORT_INTERNAL="3000"
DB_CONTAINER_NAME="postgresql_helpme"

# ====== FUNÇÕES ======

check_docker() {
    echo -e "${CYAN}[1/6] Verificando Docker...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[ERROR] Docker não está instalado${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}[ERROR] Docker não está rodando${NC}"
        echo -e "${YELLOW}[INFO] Dica: Inicie o Docker Desktop${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}[SUCESSO] Docker está rodando${NC}"
    echo ""
}

check_api_container() {
    echo -e "${CYAN}[2/6] Verificando container da API...${NC}"
    
    if docker ps | grep -q "$API_CONTAINER_NAME"; then
        echo -e "${GREEN}[SUCESSO] API rodando em container: $API_CONTAINER_NAME${NC}"
        
        # Pegar IP do container
        API_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $API_CONTAINER_NAME)
        
        # Pegar porta mapeada
        API_PORT=$(docker port $API_CONTAINER_NAME $API_PORT_INTERNAL 2>/dev/null | cut -d: -f2)
        
        if [ -n "$API_PORT" ]; then
            echo -e "${CYAN}   Porta host: $API_PORT${NC}"
            echo -e "${CYAN}   IP container: $API_IP${NC}"
            API_MODE="container"
            API_URL="http://localhost:$API_PORT"
        else
            echo -e "${YELLOW}[WARN] Porta não mapeada, tentando IP do container${NC}"
            API_MODE="container-internal"
            API_URL="http://$API_IP:$API_PORT_INTERNAL"
        fi
    else
        echo -e "${YELLOW}[WARN]  API não está rodando em container${NC}"
        API_MODE="host"
        API_URL="http://localhost:$API_PORT_HOST"
    fi
    echo ""
}

check_api_host() {
    echo -e "${CYAN}[3/6] Verificando API no host...${NC}"
    
    if lsof -Pi :$API_PORT_HOST -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}[SUCESSO] API rodando no host na porta $API_PORT_HOST${NC}"
        API_MODE="host"
        API_URL="http://localhost:$API_PORT_HOST"
    elif [ "$API_MODE" != "container" ] && [ "$API_MODE" != "container-internal" ]; then
        echo -e "${RED}[ERROR] API não está rodando (nem container, nem host)${NC}"
        echo ""
        echo -e "${YELLOW}Como iniciar a API:${NC}"
        echo ""
        echo -e "${CYAN}Opção 1 - Container (recomendado):${NC}"
        echo "  docker-compose up -d api"
        echo ""
        echo -e "${CYAN}Opção 2 - Host:${NC}"
        echo "  cd api"
        echo "  npm run dev"
        echo ""
        exit 1
    fi
    echo ""
}

test_api_connection() {
    echo -e "${CYAN}[4/6] Testando conexão com API...${NC}"
    echo -e "${CYAN}   URL: $API_URL${NC}"
    
    # Tentar login
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@helpme.com","password":"Admin123!"}' 2>/dev/null || echo "000")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}[SUCESSO] API acessível e respondendo corretamente${NC}"
        API_ACCESSIBLE="true"
    elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
        echo -e "${YELLOW}[WARN]  API acessível mas credenciais podem estar incorretas${NC}"
        echo -e "${CYAN}   HTTP Code: $HTTP_CODE${NC}"
        API_ACCESSIBLE="true"
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}[ERROR] Não foi possível conectar à API${NC}"
        echo -e "${YELLOW}[INFO] Verifique se a API está realmente rodando${NC}"
        API_ACCESSIBLE="false"
    else
        echo -e "${YELLOW}[WARN]  API respondeu com código inesperado: $HTTP_CODE${NC}"
        API_ACCESSIBLE="maybe"
    fi
    echo ""
}

check_database() {
    echo -e "${CYAN}[5/6] Verificando banco de dados...${NC}"
    
    if docker ps | grep -q "$DB_CONTAINER_NAME"; then
        echo -e "${GREEN}[SUCESSO] PostgreSQL rodando em container${NC}"
        
        # Verificar conexões
        MAX_CONN=$(docker exec $DB_CONTAINER_NAME psql -U postgres -d helpme-database -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ')
        ACTIVE_CONN=$(docker exec $DB_CONTAINER_NAME psql -U postgres -d helpme-database -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ')
        
        if [ -n "$MAX_CONN" ]; then
            echo -e "${CYAN}   max_connections: $MAX_CONN${NC}"
            echo -e "${CYAN}   Conexões ativas: $ACTIVE_CONN${NC}"
            
            # Alertar se próximo do limite
            if [ "$ACTIVE_CONN" -gt $((MAX_CONN * 80 / 100)) ]; then
                echo -e "${YELLOW}[WARN]  Conexões próximas do limite!${NC}"
            fi
        fi
    else
        echo -e "${RED}[ERROR] PostgreSQL não está rodando${NC}"
        echo -e "${YELLOW}[INFO] Inicie com: docker-compose up -d postgresql_helpme${NC}"
    fi
    echo ""
}

check_infrastructure() {
    echo -e "${CYAN}[6/6] Verificando infraestrutura...${NC}"
    
    # Redis
    if docker ps | grep -q "redis_helpme"; then
        echo -e "${GREEN}[SUCESSO] Redis rodando${NC}"
    else
        echo -e "${YELLOW}[WARN]  Redis não está rodando (opcional)${NC}"
    fi
    
    # InfluxDB
    if docker ps | grep -q "influxdb_k6_helpme"; then
        echo -e "${GREEN}[SUCESSO] InfluxDB rodando (visualização disponível)${NC}"
    else
        echo -e "${CYAN}[INFO]  InfluxDB não está rodando (visualização desabilitada)${NC}"
    fi
    
    # Grafana
    if docker ps | grep -q "grafana_k6_helpme"; then
        echo -e "${GREEN}[SUCESSO] Grafana rodando em http://localhost:3001${NC}"
    else
        echo -e "${CYAN}[INFO]  Grafana não está rodando${NC}"
    fi
    echo ""
}

generate_env_file() {
    echo -e "${CYAN}Gerando arquivo de configuração...${NC}"
    
    # CRÍTICO: Usar BASE_DIR corretamente
    ENV_FILE="$BASE_DIR/.env.k6"
    
    # Debug
    echo -e "${CYAN}[DEBUG] Arquivo será criado em: $ENV_FILE${NC}"
    
    # Verificar se diretório existe e tem permissão
    if [ ! -d "$BASE_DIR" ]; then
        echo -e "${RED}[ERROR] Diretório base não existe: $BASE_DIR${NC}"
        exit 1
    fi
    
    if [ ! -w "$BASE_DIR" ]; then
        echo -e "${RED}[ERROR] Sem permissão de escrita em: $BASE_DIR${NC}"
        exit 1
    fi
    
    cat > "$ENV_FILE" << EOF
# ============================================
# Configuração Automática - K6 Tests
# Gerado em: $(date)
# ============================================

# API Configuration
API_BASE_URL=$API_URL
API_MODE=$API_MODE

# Credentials
ADMIN_EMAIL=admin@helpme.com
ADMIN_PASSWORD=Admin123!
USER_EMAIL=user@helpme.com
USER_PASSWORD=User123!
TECNICO_EMAIL=tecnico@helpme.com
TECNICO_PASSWORD=Tecnico123!

# Test Configuration (padrão: teste leve)
MIN_VUS=1
NORMAL_VUS=5
PEAK_VUS=10
MAX_VUS=15
WARMUP_DURATION=1m
NORMAL_DURATION=3m
PEAK_DURATION=2m
COOLDOWN_DURATION=1m

# InfluxDB (visualização)
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=my-super-secret-auth-token
INFLUXDB_ORG=k6-org
INFLUXDB_BUCKET=k6
EOF

    if [ -f "$ENV_FILE" ]; then
        echo -e "${GREEN}[SUCESSO] Configuração salva em: $ENV_FILE${NC}"
    else
        echo -e "${RED}[ERROR] Falha ao criar arquivo de configuração${NC}"
        exit 1
    fi
    echo ""
}

show_summary() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  RESUMO DA CONFIGURAÇÃO                   ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}Modo de Execução:${NC} $API_MODE"
    echo -e "${CYAN}URL da API:${NC} $API_URL"
    echo -e "${CYAN}API Acessível:${NC} $API_ACCESSIBLE"
    echo -e "${CYAN}Arquivo .env.k6:${NC} $BASE_DIR/.env.k6"
    echo ""
    
    if [ "$API_ACCESSIBLE" = "true" ]; then
        echo -e "${GREEN}[SUCESSO] Ambiente pronto para testes!${NC}"
        echo ""
        echo -e "${CYAN}Próximos passos:${NC}"
        echo "  1. Executar testes: ./run-performance-tests-docker.sh"
        echo "  2. Com visualização: ./run-with-grafana.sh"
        echo "  3. Manual: cd .. && source .env.k6 && k6 run -e API_BASE_URL=\$API_BASE_URL carga/carga.js"
    else
        echo -e "${RED}[ERROR] Ambiente não está pronto${NC}"
        echo ""
        echo -e "${YELLOW}Ações necessárias:${NC}"
        
        if [ "$API_ACCESSIBLE" = "false" ]; then
            echo "  1. Iniciar a API:"
            echo "     docker-compose up -d api"
            echo "     OU"
            echo "     cd api && npm run dev"
        fi
        
        if ! docker ps | grep -q "$DB_CONTAINER_NAME"; then
            echo "  2. Iniciar PostgreSQL:"
            echo "     docker-compose up -d postgresql_helpme"
        fi
    fi
    
    echo ""
    echo -e "${CYAN}Use: source $BASE_DIR/.env.k6 antes dos testes${NC}"
    echo ""
}

# ====== EXECUÇÃO PRINCIPAL ======

check_docker
check_api_container
check_api_host
test_api_connection
check_database
check_infrastructure
generate_env_file
show_summary

# Retornar código de saída apropriado
if [ "$API_ACCESSIBLE" = "true" ]; then
    exit 0
else
    exit 1
fi