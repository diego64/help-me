#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

log_success() { echo -e "${GREEN}$1${RESET}"; }
log_error() { echo -e "${RED}$1${RESET}" >&2; }
log_warn() { echo -e "${YELLOW}$1${RESET}"; }
log_info() { echo -e "${CYAN}$1${RESET}"; }
log_title() { echo -e "${BOLD}${BLUE}$1${RESET}"; }
log_dim() { echo -e "${DIM}$1${RESET}"; }
log_normal() { echo "$1"; }

CONTAINER_NAME="postgresql_helpme"

carregar_env() {
    local env_paths=(".env" "api/.env" "../.env" "../../.env")
    local env_carregado=false
    
    for env_path in "${env_paths[@]}"; do
        if [[ -f "$env_path" ]]; then
            log_success "[SUCESSO] Arquivo .env carregado de: $env_path"
            set -a
            source "$env_path"
            set +a
            env_carregado=true
            break
        fi
    done
    
    if [[ "$env_carregado" = false ]]; then
        log_warn "[AVISO] Arquivo .env não encontrado"
        log_warn "        Tentando usar variáveis de ambiente do sistema..."
    fi
    
    if [[ -z "$DATABASE_URL" ]] && [[ -n "$DB_USER" ]] && [[ -n "$DB_PASSWORD" ]] && [[ -n "$DB_NAME" ]]; then
        local db_host="${DB_HOST:-localhost}"
        local db_port="${DB_PORT:-5432}"
        DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${db_host}:${db_port}/${DB_NAME}"
        export DATABASE_URL
        log_info "[INFO] DATABASE_URL construída a partir de variáveis separadas"
    fi
}

validar_database_url() {
    if [[ -z "$DATABASE_URL" ]]; then
        log_error "[ERRO] DATABASE_URL não está definida"
        exit 1
    fi
    
    if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]] && [[ ! "$DATABASE_URL" =~ ^postgres:// ]]; then
        log_error "[ERRO] DATABASE_URL inválida"
        exit 1
    fi
    
    log_success "[SUCESSO] DATABASE_URL validada"
}

extrair_db_info() {
    if [[ -z "$DATABASE_URL" ]]; then
        log_error "[ERRO] DATABASE_URL vazia"
        exit 1
    fi
    
    local url_sem_protocolo="${DATABASE_URL#postgresql://}"
    url_sem_protocolo="${url_sem_protocolo#postgres://}"
    
    local credentials="${url_sem_protocolo%%@*}"
    DB_USER="${credentials%%:*}"
    DB_PASSWORD="${credentials#*:}"
    
    local resto="${url_sem_protocolo#*@}"
    local host_port="${resto%%/*}"
    DB_HOST="${host_port%%:*}"
    
    if [[ "$host_port" == *":"* ]]; then
        DB_PORT="${host_port#*:}"
    else
        DB_PORT=5432
    fi
    
    DB_NAME="${resto#*/}"
    DB_NAME="${DB_NAME%%\?*}"
}

verificar_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "[ERRO] Docker não está instalado"
        exit 1
    fi
    
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        log_error "[ERRO] Container '$CONTAINER_NAME' não está rodando"
        log_normal ""
        log_normal "[INFO] Containers PostgreSQL disponíveis:"
        docker ps --filter "ancestor=bitnami/postgresql" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        exit 1
    fi
    
    log_success "[SUCESSO] Container '$CONTAINER_NAME' encontrado"
}

executar_sql() {
    local sql="$1"
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "$sql" 2>&1
}

contar_registros() {
    local tabela="$1"
    local resultado=$(executar_sql "SELECT COUNT(*) FROM \"$tabela\";" 2>/dev/null || echo "0")
    echo "$resultado" | tr -d ' '
}

mostrar_estatisticas() {
    log_title ""
    log_title "[ESTATÍSTICAS] Estado Atual do Banco de Dados"
    log_normal ""
    log_normal "======================================================================"
    
    local total_usuarios=$(contar_registros "usuarios")
    local total_expedientes=$(contar_registros "expedientes")
    local total_servicos=$(contar_registros "servicos")
    local total_chamados=$(contar_registros "chamados")
    local total_ordens=$(contar_registros "ordens_de_servico")
    
    printf "[Usuários]                %6s total\n" "$total_usuarios"
    printf "[Expedientes]             %6s total\n" "$total_expedientes"
    printf "[Serviços]                %6s total\n" "$total_servicos"
    printf "[Chamados]                %6s total\n" "$total_chamados"
    printf "[Ordens de Serviço]       %6s total\n" "$total_ordens"
    
    log_normal "======================================================================"
    log_normal ""
}

limpar_banco_hard() {
    log_title ""
    log_title "[LIMPEZA] Iniciando limpeza do banco de dados..."
    log_info "[MODO] DELETE PERMANENTE"
    log_normal ""
    
    local total_removidos=0
    local tabelas=("ordens_de_servico" "chamados" "expedientes" "servicos" "usuarios")
    
    for tabela in "${tabelas[@]}"; do
        local count_antes=$(contar_registros "$tabela")
        
        if [[ "$count_antes" -gt 0 ]]; then
            executar_sql "DELETE FROM \"$tabela\";" > /dev/null 2>&1
            total_removidos=$((total_removidos + count_antes))
            printf "${GREEN}[OK]${RESET} %-20s %s registros removidos\n" "$tabela" "$count_antes"
        else
            printf "${DIM}[--]${RESET} %-20s Nenhum registro encontrado\n" "$tabela"
        fi
    done
    
    log_normal ""
    log_normal "======================================================================"
    log_info "[TOTAL] $total_removidos registros removidos"
    log_normal "======================================================================"
    log_success ""
    log_success "[CONCLUÍDO] Limpeza concluída com sucesso!"
    log_normal ""
}

limpar_banco_soft() {
    log_title ""
    log_title "[LIMPEZA] Iniciando limpeza do banco de dados..."
    log_info "[MODO] SOFT DELETE"
    log_normal ""
    
    local total_marcados=0
    local agora=$(date -u +"%Y-%m-%d %H:%M:%S")
    local tabelas=("ordens_de_servico" "chamados" "expedientes" "servicos" "usuarios")
    
    for tabela in "${tabelas[@]}"; do
        local count=$(executar_sql "SELECT COUNT(*) FROM \"$tabela\" WHERE deletado_em IS NULL;" | tr -d ' ')
        
        if [[ "$count" -gt 0 ]]; then
            executar_sql "UPDATE \"$tabela\" SET deletado_em = '$agora' WHERE deletado_em IS NULL;" > /dev/null 2>&1
            total_marcados=$((total_marcados + count))
            printf "${GREEN}[OK]${RESET} %-20s %s registros marcados como deletados\n" "$tabela" "$count"
        else
            printf "${DIM}[--]${RESET} %-20s Nenhum registro encontrado\n" "$tabela"
        fi
    done
    
    log_normal ""
    log_normal "======================================================================"
    log_info "[TOTAL] $total_marcados registros marcados"
    log_normal "======================================================================"
    log_success ""
    log_success "[CONCLUÍDO] Limpeza concluída com sucesso!"
    log_normal ""
}

limpar_soft_deletes_antigos() {
    local dias=${1:-30}
    
    log_title ""
    log_title "[LIMPEZA] Removendo registros soft delete de mais de $dias dias..."
    log_normal ""
    
    local data_limite=$(date -u -d "$dias days ago" +"%Y-%m-%d %H:%M:%S")
    local total_removidos=0
    local tabelas=("ordens_de_servico" "chamados" "expedientes" "servicos" "usuarios")
    
    for tabela in "${tabelas[@]}"; do
        local count=$(executar_sql "SELECT COUNT(*) FROM \"$tabela\" WHERE deletado_em < '$data_limite' AND deletado_em IS NOT NULL;" | tr -d ' ')
        
        if [[ "$count" -gt 0 ]]; then
            executar_sql "DELETE FROM \"$tabela\" WHERE deletado_em < '$data_limite' AND deletado_em IS NOT NULL;" > /dev/null 2>&1
            total_removidos=$((total_removidos + count))
            printf "${GREEN}[OK]${RESET} %-20s %s registros antigos removidos\n" "$tabela" "$count"
        else
            printf "${DIM}[--]${RESET} %-20s Nenhum registro antigo encontrado\n" "$tabela"
        fi
    done
    
    log_normal ""
    log_normal "======================================================================"
    log_info "[TOTAL] $total_removidos registros antigos removidos"
    log_normal "======================================================================"
    log_normal ""
}

confirmar_limpeza() {
    log_warn ""
    log_warn "[ATENÇÃO] Esta ação vai limpar TODOS os dados do banco!"
    echo -n "          Digite 'CONFIRMAR' para continuar: "
    read -r resposta
    
    if [[ "${resposta^^}" != "CONFIRMAR" ]]; then
        return 1
    fi
    return 0
}

mostrar_ajuda() {
    log_title ""
    log_title "========================================"
    log_title "  LIMPEZA DA BASE DE DADOS POSTGRESQL  "
    log_title "========================================"
    log_normal ""
    log_normal "USO:"
    log_normal "  ./limpar-base.sh [opções]"
    log_normal ""
    log_info "OPÇÕES:"
    log_normal "  --force        Pula a confirmação"
    log_normal "  --soft         Usa soft delete"
    log_normal "  --clean-old    Remove soft deletes antigos"
    log_normal "  --days=N       Define dias para --clean-old (padrão: 30)"
    log_normal "  --container=X  Nome do container (padrão: postgresql_helpme)"
    log_normal "  --help, -h     Mostra esta ajuda"
    log_normal ""
    log_info "EXEMPLOS:"
    log_normal "  ./limpar-base.sh"
    log_normal "  ./limpar-base.sh --force"
    log_normal "  ./limpar-base.sh --soft"
    log_normal "  ./limpar-base.sh --clean-old --days=60"
    log_normal "  ./limpar-base.sh --container=postgresql_helpme_teste"
    log_normal ""
}

main() {
    local force=false
    local soft=false
    local clean_old=false
    local dias=30
    
    for arg in "$@"; do
        case $arg in
            --help|-h) mostrar_ajuda; exit 0 ;;
            --force) force=true ;;
            --soft) soft=true ;;
            --clean-old) clean_old=true ;;
            --days=*) dias="${arg#*=}" ;;
            --container=*) CONTAINER_NAME="${arg#*=}" ;;
        esac
    done
    
    log_title ""
    log_title "========================================"
    log_title "  SCRIPT DE LIMPEZA DO BANCO DE DADOS  "
    log_title "========================================"
    log_normal ""
    log_normal "[INFO] Diretório: $(pwd)"
    log_normal "[INFO] Ambiente: ${NODE_ENV:-development}"
    log_normal "[INFO] Container: $CONTAINER_NAME"
    log_normal ""
    
    carregar_env
    validar_database_url
    extrair_db_info
    verificar_docker
    
    log_info "[CONEXÃO] Testando conexão com o banco de dados..."
    if executar_sql "SELECT 1;" > /dev/null 2>&1; then
        log_success "[CONEXÃO] Conexão estabelecida com sucesso"
    else
        log_error "[ERRO] Não foi possível conectar ao banco de dados"
        exit 1
    fi
    
    mostrar_estatisticas
    
    if [[ "$force" = false ]]; then
        if ! confirmar_limpeza; then
            log_warn ""
            log_warn "[CANCELADO] Operação cancelada pelo usuário"
            log_normal ""
            exit 0
        fi
    fi
    
    if [[ "$clean_old" = true ]]; then
        limpar_soft_deletes_antigos "$dias"
    elif [[ "$soft" = true ]]; then
        limpar_banco_soft
    else
        limpar_banco_hard
    fi
    
    mostrar_estatisticas
    
    log_success "[SUCESSO] Script executado com sucesso!"
    log_normal ""
    log_info "[PRÓXIMO PASSO] Execute o seed: docker-compose exec api pnpm run seed"
    log_normal ""
}

main "$@"