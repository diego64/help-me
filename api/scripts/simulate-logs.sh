#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Configurações
API_URL="${API_URL:-http://localhost:3000}"
INTERVAL_MINUTES="${INTERVAL_MINUTES:-1}"
INTERVAL_SECONDS=$((INTERVAL_MINUTES * 30))

# Variáveis globais para tokens
declare -A TOKENS

# Credenciais dos usuários
USUARIOS=(
  "admin@helpme.com:Admin123!:Admin"
  "tecnico@helpme.com:Tecnico123!:Carlos"
  "user@helpme.com:User123!:João"
  "maria.costa@helpme.com:User123!:Maria"
  "pedro.lima@helpme.com:User123!:Pedro"
  "ana.santos@helpme.com:Tecnico123!:Ana"
  "roberto.ferreira@helpme.com:Tecnico123!:Roberto"
)

# Descrições de chamados
DESCRICOES=(
  "Computador não liga após atualização do Windows"
  "Internet muito lenta no setor financeiro"
  "Impressora HP não funciona - papel preso"
  "Email Outlook não sincroniza no celular"
  "Preciso instalar Adobe Creative Cloud urgente"
  "VPN Cisco não conecta - erro de autenticação"
  "Senha expirada preciso resetar no Active Directory"
  "Mouse Logitech sem fio não funciona"
  "Monitor Dell com problema de imagem - listras"
  "Teclado Microsoft derramou café - preciso trocar"
  "Sistema SAP ERP travando constantemente"
  "Backup Veeam falhou ontem - verificar"
  "Permissão de acesso negada no compartilhamento de rede"
  "Scanner Epson não é reconhecido pelo sistema"
  "Webcam Logitech não funciona para reunião Teams"
)

# Funções de log
log_success() {
  echo -e "${GREEN}[INFO] $1${NC}"
}

log_info() {
  echo -e "${CYAN}[INFO] $1${NC}"
}

log_warn() {
  echo -e "${YELLOW}[INFO] $1${NC}"
}

log_error() {
  echo -e "${RED}[INFO] $1${NC}"
}

log_title() {
  echo -e "${BOLD}${MAGENTA}$1${NC}"
}

# Função para fazer requisição
fazer_requisicao() {
  local metodo="$1"
  local url="$2"
  local token="$3"
  local data="$4"
  local descricao="$5"
  
  local response
  local http_code
  
  if [ -n "$token" ]; then
    if [ -n "$data" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "${metodo}" "${API_URL}${url}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "${data}" 2>/dev/null)
    else
      response=$(curl -s -w "\n%{http_code}" -X "${metodo}" "${API_URL}${url}" \
        -H "Authorization: Bearer ${token}" 2>/dev/null)
    fi
  else
    if [ -n "$data" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "${metodo}" "${API_URL}${url}" \
        -H "Content-Type: application/json" \
        -d "${data}" 2>/dev/null)
    else
      response=$(curl -s -w "\n%{http_code}" -X "${metodo}" "${API_URL}${url}" 2>/dev/null)
    fi
  fi
  
  http_code=$(echo "$response" | tail -n1)
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    log_success "${descricao} (HTTP ${http_code})"
  elif [ "$http_code" = "401" ]; then
    log_error "${descricao} - Não autorizado (HTTP ${http_code})"
  elif [ "$http_code" = "404" ]; then
    log_warn "${descricao} - Não encontrado (HTTP ${http_code})"
  else
    log_error "${descricao} (HTTP ${http_code})"
  fi
  
  echo "$response"
}

# Função para fazer login
login() {
  local email="$1"
  local password="$2"
  local nome="$3"
  
  local response=$(fazer_requisicao "POST" "/auth/login" "" "{\"email\":\"${email}\",\"password\":\"${password}\"}" "Login ${nome}")
  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    local token=$(echo "$body" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    TOKENS["$email"]="$token"
    return 0
  fi
  return 1
}

# Função para item aleatório
random_item() {
  local array=("$@")
  local random_index=$((RANDOM % ${#array[@]}))
  echo "${array[$random_index]}"
}

# Delay
delay() {
  sleep "$1"
}

# Simulação principal
simular_atividade() {
  log_title "\n[INFO] INICIANDO SIMULAÇÃO - $(date '+%H:%M:%S')\n"
  
  # Login
  log_info "═══ FASE 1: LOGIN ═══"
  for user_data in "${USUARIOS[@]}"; do
    IFS=':' read -r email password nome <<< "$user_data"
    login "$email" "$password" "$nome"
    delay 0.2
  done
  echo ""
  
  # Health checks
  log_info "═══ FASE 2: HEALTH CHECKS ═══"
  for i in {1..3}; do
    fazer_requisicao "GET" "/health" "" "" "Health #${i}" > /dev/null
    delay 0.2
  done
  echo ""
  
  # Admin lista recursos
  log_info "═══ FASE 3: LISTAR RECURSOS ═══"
  local admin_token="${TOKENS[admin@helpme.com]}"
  
  if [ -n "$admin_token" ]; then
    fazer_requisicao "GET" "/servicos?page=1&limit=10" "$admin_token" "" "Listar serviços" > /dev/null
    delay 0.3
    fazer_requisicao "GET" "/usuarios?page=1&limit=20" "$admin_token" "" "Listar usuários" > /dev/null
    delay 0.3
    fazer_requisicao "GET" "/tecnicos?page=1&limit=10" "$admin_token" "" "Listar técnicos" > /dev/null
    delay 0.3
  fi
  echo ""
  
  # Criar chamados
  log_info "═══ FASE 4: CRIAR CHAMADOS ═══"
  for i in {1..3}; do
    local user_email=$(random_item "user@helpme.com" "maria.costa@helpme.com" "pedro.lima@helpme.com")
    local user_token="${TOKENS[$user_email]}"
    local descricao=$(random_item "${DESCRICOES[@]}")
    
    if [ -n "$user_token" ]; then
      fazer_requisicao "POST" "/chamados/abertura-chamado" "$user_token" "{\"descricao\":\"${descricao}\"}" "Criar chamado" > /dev/null
      delay 0.4
    fi
  done
  echo ""
  
  # Técnicos listam
  log_info "═══ FASE 5: TÉCNICOS ═══"
  local tecnico_token="${TOKENS[tecnico@helpme.com]}"
  if [ -n "$tecnico_token" ]; then
    fazer_requisicao "GET" "/chamados?page=1&limit=20" "$tecnico_token" "" "Listar chamados" > /dev/null
  fi
  echo ""
  
  # Erros 404
  log_info "═══ FASE 6: TESTES DE ERRO ═══"
  fazer_requisicao "GET" "/usuarios/99999" "$admin_token" "" "Teste 404" > /dev/null
  delay 0.2
  fazer_requisicao "POST" "/auth/login" "" '{"email":"fake@test.com","password":"wrong"}' "Teste 401" > /dev/null
  echo ""
  
  log_success "[SUCESSO] Ciclo concluído!\n"
}

# Cleanup
cleanup() {
  log_warn "\n\n[WARN]  Interrompido"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Main
main() {
  log_title "╔═══════════════════════════════════════╗"
  log_title "║   SIMULADOR DE LOGS - HELP ME API     ║"
  log_title "╚═══════════════════════════════════════╝\n"
  log_info "API: ${API_URL}"
  log_info "Intervalo: ${INTERVAL_MINUTES}min (${INTERVAL_SECONDS}s)\n"
  log_warn "Pressione Ctrl+C para parar\n"
  
  simular_atividade
  
  while true; do
    log_title "[INFO] Aguardando ${INTERVAL_SECONDS}s...\n"
    sleep "$INTERVAL_SECONDS"
    log_title "\n$(date '+%H:%M:%S') - NOVA EXECUÇÃO\n"
    simular_atividade
  done
}

main
