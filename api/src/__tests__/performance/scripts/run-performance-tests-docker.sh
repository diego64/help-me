#!/bin/bash

# ============================================
# Help-Me API - Testes de Performance
# (Versão para pasta scripts/)
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Detectar diretórios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"  # Volta para performance/

# Carregar configuração
ENV_FILE="$BASE_DIR/.env.k6"

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${YELLOW}[WARN]  Arquivo .env.k6 não encontrado${NC}"
    echo -e "${CYAN}Executando check-env.sh...${NC}"
    bash "$SCRIPT_DIR/check-env.sh"
    source "$ENV_FILE"
fi

# Diretórios de testes (relativos a BASE_DIR)
CARGA_DIR="$BASE_DIR/carga"
SPIKE_DIR="$BASE_DIR/spike"
SOAK_DIR="$BASE_DIR/soak"
STRESS_DIR="$BASE_DIR/stress"
RESULTS_DIR="$BASE_DIR/results"

# Criar diretórios se não existirem
mkdir -p "$RESULTS_DIR"/{json,csv,html}

show_menu() {
    clear
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                            ║${NC}"
    echo -e "${BLUE}║          Help-Me API - Testes de Performance               ║${NC}"
    echo -e "${BLUE}║                  (Docker Ready Edition)                    ║${NC}"
    echo -e "${BLUE}║                                                            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo ""
    echo -e "${CYAN}Escolha um tipo de teste:${NC}"
    echo ""
    echo -e "  ${GREEN}1)${NC} Leve     - Desenvolvimento  (3min,  VUs: 1→5)${NC}"
    echo -e "  ${YELLOW}2)${NC} Médio    - Homologação     (10min, VUs: 2→15)${NC}"
    echo -e "  ${RED}3)${NC} Pesado   - Produção        (20min, VUs: 5→30)${NC}"
    echo -e "  ${CYAN}4)${NC} Spike    - Picos de Carga  (8min,  VUs variáveis)${NC}"
    echo -e "  ${BLUE}5)${NC} Soak     - Resistência     (30min, VUs: 20)${NC}"
    echo ""
    echo -e "  ${CYAN}6)${NC} Abrir Grafana"
    echo -e "  ${CYAN}7)${NC} Limpar resultados antigos"
    echo -e "  ${CYAN}8)${NC} Re-detectar ambiente"
    echo -e "  ${RED}0)${NC} Sair"
    echo ""
    
    if [ -n "$API_BASE_URL" ]; then
        echo -e "${GREEN}[SUCESSO] API:${NC} $API_BASE_URL"
    else
        echo -e "${YELLOW}[WARN]  URL da API não configurada${NC}"
    fi
    echo ""
}

run_test() {
    local test_type=$1
    local test_name=$2
    local test_file=$3
    local min_vus=$4
    local peak_vus=$5
    local duration=$6
    
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $test_name${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}[INFO]  Configuração:${NC}"
    echo -e "${CYAN}[INFO]    • VUs: $min_vus → ... → $peak_vus${NC}"
    echo -e "${CYAN}[INFO]    • Duração: ~$duration${NC}"
    echo -e "${CYAN}[INFO]    • Objetivo: Validação rápida${NC}"
    echo ""
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local json_file="$RESULTS_DIR/json/${test_type}_${timestamp}.json"
    local csv_file="$RESULTS_DIR/csv/${test_type}_${timestamp}.csv"
    local summary_file="$RESULTS_DIR/json/${test_type}_summary_${timestamp}.json"
    local html_file="$RESULTS_DIR/html/${test_type}_${timestamp}.html"
    
    k6 run \
        -e API_BASE_URL="$API_BASE_URL" \
        -e MIN_VUS="$min_vus" \
        -e PEAK_VUS="$peak_vus" \
        --out "json=$json_file" \
        --out "csv=$csv_file" \
        --summary-export="$summary_file" \
        "$test_file" || true
    
    echo ""
    echo -e "${GREEN}[SUCESSO] Teste $test_type concluído!${NC}"
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Resultados - $test_type${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Arquivos gerados:${NC}"
    echo "  • JSON: $json_file"
    echo "  • CSV: $csv_file"
    echo "  • Summary: $summary_file"
    
    if [ -f "$html_file" ]; then
        echo "  • HTML: $html_file"
    fi
    
    echo ""
    
    if [ -f "$summary_file" ]; then
        analyze_results "$summary_file"
    fi
    
    echo ""
    read -p "Pressione ENTER para continuar..."
}

analyze_results() {
    local summary_file=$1
    
    if command -v jq &> /dev/null; then
        echo -e "${CYAN}Análise Rápida:${NC}"
        
        local total_reqs=$(jq -r '.metrics.http_reqs.values.count // 0' "$summary_file")
        local avg_duration=$(jq -r '.metrics.http_req_duration.values.avg // 0' "$summary_file")
        local p95_duration=$(jq -r '.metrics.http_req_duration.values["p(95)"] // 0' "$summary_file")
        local error_rate=$(jq -r '.metrics.http_req_failed.values.rate // 0' "$summary_file")
        
        echo "  • Total de requisições: $total_reqs"
        echo "  • Latência média: $(printf "%.2f" $avg_duration)ms"
        echo "  • P95: $(printf "%.2f" $p95_duration)ms"
        echo "  • Taxa de erro: $(printf "%.2f" $(echo "$error_rate * 100" | bc))%"
        
        local p95_ok=$(echo "$p95_duration < 2000" | bc)
        local error_ok=$(echo "$error_rate < 0.15" | bc)
        
        if [ "$p95_ok" -eq 1 ]; then
            echo -e "${GREEN}[SUCESSO] P95 dentro do threshold (<2000ms)${NC}"
        else
            echo -e "${RED}[ERROR] P95 acima do threshold${NC}"
        fi
        
        if [ "$error_ok" -eq 1 ]; then
            echo -e "${GREEN}[SUCESSO] Taxa de erro aceitável (<15%)${NC}"
        else
            echo -e "${YELLOW}[WARN]  Taxa de erro elevada${NC}"
        fi
    else
        echo -e "${YELLOW}[INFO]  Instale 'jq' para análise automática${NC}"
    fi
}

clean_results() {
    echo ""
    echo -e "${YELLOW}Limpar resultados antigos?${NC}"
    echo "  1) Sim, limpar tudo"
    echo "  2) Não"
    echo ""
    read -p "Opção: " clean_choice
    
    if [ "$clean_choice" = "1" ]; then
        rm -rf "$RESULTS_DIR"/{json,csv,html}/*
        echo -e "${GREEN}[SUCESSO] Resultados limpos${NC}"
    fi
    
    read -p "Pressione ENTER para continuar..."
}

redetect_environment() {
    echo ""
    echo -e "${CYAN}Re-detectando ambiente...${NC}"
    bash "$SCRIPT_DIR/check-env.sh"
    source "$ENV_FILE"
    echo ""
    read -p "Pressione ENTER para continuar..."
}

# Menu principal
while true; do
    show_menu
    read -p "Opção: " choice
    
    case $choice in
        1)
            run_test "light" "TESTE LEVE - Desenvolvimento" \
                "$CARGA_DIR/carga.js" 1 5 "3 minutos"
            ;;
        2)
            run_test "medium" "TESTE MÉDIO - Homologação" \
                "$CARGA_DIR/carga.js" 2 15 "10 minutos"
            ;;
        3)
            run_test "heavy" "TESTE PESADO - Produção" \
                "$CARGA_DIR/carga.js" 5 30 "20 minutos"
            ;;
        4)
            run_test "spike" "TESTE SPIKE - Picos de Carga" \
                "$SPIKE_DIR/spike.js" 1 50 "8 minutos"
            ;;
        5)
            run_test "soak" "TESTE SOAK - Resistência" \
                "$SOAK_DIR/soak.js" 20 20 "30 minutos"
            ;;
        6)
            if command -v xdg-open &> /dev/null; then
                xdg-open "http://localhost:3001"
            elif command -v open &> /dev/null; then
                open "http://localhost:3001"
            else
                echo "Abra manualmente: http://localhost:3001"
            fi
            ;;
        7)
            clean_results
            ;;
        8)
            redetect_environment
            ;;
        0)
            echo ""
            echo -e "${GREEN}[INFO] Até logo!${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR] Opção inválida${NC}"
            sleep 1
            ;;
    esac
done