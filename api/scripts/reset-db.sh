#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC}    $1"; }
log_error()   { echo -e "${RED}[ERRO]${NC}    $1"; }
log_section() { echo -e "\n${CYAN}${BOLD}==> $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  log_error "Arquivo .env não encontrado em: $ENV_FILE"
  exit 1
fi

# Exportar variáveis do .env (ignorar comentários e linhas vazias)
# Usa env -i para evitar que valores com espaços/acentos sejam interpretados como comandos
while IFS= read -r line; do
  # Ignora comentários e linhas vazias
  [[ "$line" =~ ^\s*# ]] && continue
  [[ -z "${line// }" ]] && continue
  # Ignora linhas que não são KEY=VALUE
  [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
  export "$line"
done < "$ENV_FILE"

log_info "Variáveis carregadas de: $ENV_FILE"

DEV_PG_CONTAINER="postgresql_helpme"
DEV_PG_USER="${DB_USER:-postgres}"
DEV_PG_PASSWORD="${DB_PASSWORD:-postgres}"
DEV_PG_DB="${DB_NAME:-helpme}"
DEV_PG_PORT="${DB_PORT:-5432}"

DEV_MONGO_CONTAINER="mongodb_helpme"
DEV_MONGO_USER="${MONGO_INITDB_ROOT_USERNAME:-root}"
DEV_MONGO_PASSWORD="${MONGO_INITDB_ROOT_PASSWORD:-root}"
DEV_MONGO_DB="${MONGO_INITDB_DATABASE:-helpme}"
DEV_MONGO_PORT="${MONGO_PORT:-27017}"

DEV_REDIS_CONTAINER="redis_helpme"
DEV_REDIS_PORT="${REDIS_PORT:-6379}"
DEV_REDIS_PASSWORD="${REDIS_PASSWORD:-}"

DEV_INFLUX_CONTAINER="influxdb_helpme"
DEV_INFLUX_PORT="${INFLUX_PORT:-8086}"
DEV_INFLUX_TOKEN="${INFLUX_ADMIN_TOKEN:-}"
DEV_INFLUX_ORG="${INFLUX_ORG:-org}"
DEV_INFLUX_BUCKET="${INFLUX_BUCKET:-helpme_bucket}"

DEV_MINIO_CONTAINER="minio_helpme"
DEV_MINIO_PORT="${MINIO_PORT:-9000}"
DEV_MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
DEV_MINIO_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

TEST_PG_CONTAINER="postgresql_helpme_teste"
TEST_PG_USER="${DB_USER_TESTE:-teste}"
TEST_PG_PASSWORD="${DB_PASSWORD_TESTE:-senha_teste}"
TEST_PG_DB="${DB_NAME_TESTE:-helpme-database-teste}"
TEST_PG_PORT="${DB_PORT_TESTE:-5434}"

TEST_MONGO_CONTAINER="mongodb_helpme_teste"
TEST_MONGO_USER="${MONGO_INITDB_ROOT_USERNAME_TESTE:-teste}"
TEST_MONGO_PASSWORD="${MONGO_INITDB_ROOT_PASSWORD_TESTE:-senha_teste}"
TEST_MONGO_DB="${MONGO_INITDB_DATABASE_TESTE:-helpme_teste}"
TEST_MONGO_PORT="${MONGO_PORT_TESTE:-27018}"

TEST_REDIS_CONTAINER="redis_helpme_teste"
TEST_REDIS_PORT="${REDIS_PORT_TESTE:-6380}"
TEST_REDIS_PASSWORD="${REDIS_PASSWORD_TESTE:-}"

TEST_INFLUX_CONTAINER="influxdb_helpme_teste"
TEST_INFLUX_PORT="${INFLUX_PORT_TESTE:-8087}"
TEST_INFLUX_TOKEN="${INFLUX_ADMIN_TOKEN_TESTE:-TestToken123456}"
TEST_INFLUX_ORG="${INFLUX_ORG_TESTE:-org_teste}"
TEST_INFLUX_BUCKET="${INFLUX_BUCKET_TESTE:-helpme_bucket_teste}"

TEST_MINIO_CONTAINER="minio_helpme_teste"
TEST_MINIO_PORT="${MINIO_PORT_TESTE:-9002}"
TEST_MINIO_USER="${MINIO_ROOT_USER_TESTE:-minio_teste}"
TEST_MINIO_PASSWORD="${MINIO_ROOT_PASSWORD_TESTE:-minio_teste_senha}"

clear
echo ""
echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${RED}${BOLD}║              LIMPEZA DE BANCO DE DADOS              ║${NC}"
echo -e "${RED}${BOLD}║                   Help-Me API                       ║${NC}"
echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}${BOLD}Selecione o ambiente que deseja limpar:${NC}"
echo ""
echo -e "  ${BOLD}1)${NC} Desenvolvimento"
echo -e "     • PostgreSQL  → ${DEV_PG_DB} (porta ${DEV_PG_PORT})"
echo -e "     • MongoDB     → ${DEV_MONGO_DB} (porta ${DEV_MONGO_PORT})"
echo -e "     • Redis       → porta ${DEV_REDIS_PORT}"
echo -e "     • InfluxDB    → bucket ${DEV_INFLUX_BUCKET} (porta ${DEV_INFLUX_PORT})"
echo -e "     • MinIO       → todos os buckets (porta ${DEV_MINIO_PORT})"
echo ""
echo -e "  ${BOLD}2)${NC} Teste"
echo -e "     • PostgreSQL  → ${TEST_PG_DB} (porta ${TEST_PG_PORT})"
echo -e "     • MongoDB     → ${TEST_MONGO_DB} (porta ${TEST_MONGO_PORT})"
echo -e "     • Redis       → porta ${TEST_REDIS_PORT}"
echo -e "     • InfluxDB    → bucket ${TEST_INFLUX_BUCKET} (porta ${TEST_INFLUX_PORT})"
echo -e "     • MinIO       → todos os buckets (porta ${TEST_MINIO_PORT})"
echo ""
echo -e "  ${BOLD}3)${NC} Ambos (Desenvolvimento + Teste)"
echo ""
echo -e "  ${BOLD}0)${NC} Cancelar"
echo ""

read -r -p "$(echo -e "${YELLOW}${BOLD}Opção: ${NC}")" OPCAO

case "$OPCAO" in
  1) LIMPAR_DEV=true;  LIMPAR_TEST=false; LABEL="Desenvolvimento" ;;
  2) LIMPAR_DEV=false; LIMPAR_TEST=true;  LABEL="Teste" ;;
  3) LIMPAR_DEV=true;  LIMPAR_TEST=true;  LABEL="Desenvolvimento + Teste" ;;
  0|"")
    log_info "Operação cancelada."
    exit 0
    ;;
  *)
    log_error "Opção inválida."
    exit 1
    ;;
esac

echo ""
echo -e "${YELLOW}${BOLD}ATENÇÃO: Todos os dados do ambiente '${LABEL}' serão apagados!${NC}"
echo ""
read -r -p "$(echo -e "${YELLOW}${BOLD}Digite 'LIMPAR' para confirmar: ${NC}")" CONFIRM

if [ "$CONFIRM" != "LIMPAR" ]; then
  log_info "Operação cancelada."
  exit 0
fi

echo ""
ERRORS=0

limpar_postgresql() {
  local CONTAINER=$1
  local PG_USER=$2
  local PG_DB=$3
  local LABEL=$4

  log_section "PostgreSQL — ${LABEL}"

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log_info "Conectando ao PostgreSQL (${CONTAINER})..."

    TRUNCATE_SQL="
      DO \$\$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
        ) LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END \$\$;
    "

    if docker exec "$CONTAINER" \
      psql -U "$PG_USER" -d "$PG_DB" -c "$TRUNCATE_SQL" > /dev/null 2>&1; then
      log_success "PostgreSQL limpo — ${LABEL} (tabelas truncadas, sequences resetadas)"
    else
      log_error "Falha ao limpar PostgreSQL — ${LABEL}"
      ERRORS=$((ERRORS + 1))
    fi
  else
    log_warning "Container '${CONTAINER}' não está rodando — pulando"
  fi
}

limpar_mongodb() {
  local CONTAINER=$1
  local MONGO_USER=$2
  local MONGO_PASSWORD=$3
  local MONGO_DB=$4
  local LABEL=$5

  log_section "MongoDB — ${LABEL}"

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log_info "Conectando ao MongoDB (${CONTAINER})..."

    MONGO_CMD="db.getCollectionNames().forEach(function(col) {
      if (col !== 'system.users' && col !== 'system.roles') {
        db.getCollection(col).deleteMany({});
      }
    });"

    if docker exec "$CONTAINER" \
      mongosh --quiet \
        --username "$MONGO_USER" \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        "$MONGO_DB" \
        --eval "$MONGO_CMD" > /dev/null 2>&1; then
      log_success "MongoDB limpo — ${LABEL} (collections esvaziadas)"
    else
      log_error "Falha ao limpar MongoDB — ${LABEL}"
      ERRORS=$((ERRORS + 1))
    fi
  else
    log_warning "Container '${CONTAINER}' não está rodando — pulando"
  fi
}

limpar_redis() {
  local CONTAINER=$1
  local REDIS_PASSWORD=$2
  local LABEL=$3

  log_section "Redis — ${LABEL}"

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log_info "Conectando ao Redis (${CONTAINER})..."

    if [ -n "$REDIS_PASSWORD" ]; then
      REDIS_FLUSH_CMD="docker exec ${CONTAINER} redis-cli -a '${REDIS_PASSWORD}' FLUSHALL"
    else
      REDIS_FLUSH_CMD="docker exec ${CONTAINER} redis-cli FLUSHALL"
    fi

    if eval "$REDIS_FLUSH_CMD" > /dev/null 2>&1; then
      log_success "Redis limpo — ${LABEL} (FLUSHALL executado)"
    else
      log_error "Falha ao limpar Redis — ${LABEL}"
      ERRORS=$((ERRORS + 1))
    fi
  else
    log_warning "Container '${CONTAINER}' não está rodando — pulando"
  fi
}

limpar_influxdb() {
  local CONTAINER=$1
  local INFLUX_TOKEN=$2
  local INFLUX_ORG=$3
  local INFLUX_BUCKET=$4
  local LABEL=$5

  log_section "InfluxDB — ${LABEL}"

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    if [ -z "$INFLUX_TOKEN" ]; then
      log_warning "Token do InfluxDB não definido — pulando (${LABEL})"
      return
    fi

    log_info "Limpando bucket '${INFLUX_BUCKET}' (${CONTAINER})..."

    DELETE_RESULT=$(docker exec "$CONTAINER" \
      influx delete \
        --host "http://localhost:8086" \
        --token "$INFLUX_TOKEN" \
        --org "$INFLUX_ORG" \
        --bucket "$INFLUX_BUCKET" \
        --start "1970-01-01T00:00:00Z" \
        --stop "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        2>&1) && RC=0 || RC=$?

    if [ $RC -eq 0 ]; then
      log_success "InfluxDB limpo — ${LABEL} (bucket '${INFLUX_BUCKET}' esvaziado)"
    else
      log_error "Falha ao limpar InfluxDB — ${LABEL}: $DELETE_RESULT"
      ERRORS=$((ERRORS + 1))
    fi
  else
    log_warning "Container '${CONTAINER}' não está rodando — pulando"
  fi
}

limpar_minio() {
  local CONTAINER=$1
  local MINIO_USER=$2
  local MINIO_PASSWORD=$3
  local LABEL=$4

  log_section "MinIO — ${LABEL}"

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    log_info "Conectando ao MinIO (${CONTAINER})..."

    docker exec "$CONTAINER" \
      mc alias set local http://localhost:9000 "$MINIO_USER" "$MINIO_PASSWORD" > /dev/null 2>&1

    BUCKETS=$(docker exec "$CONTAINER" mc ls local/ 2>/dev/null | awk '{print $NF}' | tr -d '/')

    if [ -z "$BUCKETS" ]; then
      log_info "Nenhum bucket encontrado — ${LABEL}"
    else
      BUCKET_ERRORS=0
      while IFS= read -r BUCKET; do
        if [ -n "$BUCKET" ]; then
          if docker exec "$CONTAINER" mc rm --recursive --force "local/${BUCKET}" > /dev/null 2>&1; then
            log_success "Bucket '${BUCKET}' limpo — ${LABEL}"
          else
            log_error "Falha ao limpar bucket '${BUCKET}' — ${LABEL}"
            BUCKET_ERRORS=$((BUCKET_ERRORS + 1))
          fi
        fi
      done <<< "$BUCKETS"

      if [ $BUCKET_ERRORS -gt 0 ]; then
        ERRORS=$((ERRORS + 1))
      fi
    fi
  else
    log_warning "Container '${CONTAINER}' não está rodando — pulando"
  fi
}

if [ "$LIMPAR_DEV" = true ]; then
  echo ""
  echo -e "${RED}${BOLD}──────────────────────────────────────────────────${NC}"
  echo -e "${RED}${BOLD}  AMBIENTE: DESENVOLVIMENTO${NC}"
  echo -e "${RED}${BOLD}──────────────────────────────────────────────────${NC}"

  limpar_postgresql "$DEV_PG_CONTAINER"    "$DEV_PG_USER"       "$DEV_PG_DB"       "Desenvolvimento"
  limpar_mongodb    "$DEV_MONGO_CONTAINER" "$DEV_MONGO_USER"    "$DEV_MONGO_PASSWORD" "$DEV_MONGO_DB" "Desenvolvimento"
  limpar_redis      "$DEV_REDIS_CONTAINER" "$DEV_REDIS_PASSWORD" "Desenvolvimento"
  limpar_influxdb   "$DEV_INFLUX_CONTAINER" "$DEV_INFLUX_TOKEN" "$DEV_INFLUX_ORG"  "$DEV_INFLUX_BUCKET" "Desenvolvimento"
  limpar_minio      "$DEV_MINIO_CONTAINER" "$DEV_MINIO_USER"    "$DEV_MINIO_PASSWORD" "Desenvolvimento"
fi

if [ "$LIMPAR_TEST" = true ]; then
  echo ""
  echo -e "${YELLOW}${BOLD}──────────────────────────────────────────────────${NC}"
  echo -e "${YELLOW}${BOLD}  AMBIENTE: TESTE${NC}"
  echo -e "${YELLOW}${BOLD}──────────────────────────────────────────────────${NC}"

  limpar_postgresql "$TEST_PG_CONTAINER"    "$TEST_PG_USER"       "$TEST_PG_DB"       "Teste"
  limpar_mongodb    "$TEST_MONGO_CONTAINER" "$TEST_MONGO_USER"    "$TEST_MONGO_PASSWORD" "$TEST_MONGO_DB" "Teste"
  limpar_redis      "$TEST_REDIS_CONTAINER" "$TEST_REDIS_PASSWORD" "Teste"
  limpar_influxdb   "$TEST_INFLUX_CONTAINER" "$TEST_INFLUX_TOKEN" "$TEST_INFLUX_ORG"  "$TEST_INFLUX_BUCKET" "Teste"
  limpar_minio      "$TEST_MINIO_CONTAINER" "$TEST_MINIO_USER"    "$TEST_MINIO_PASSWORD" "Teste"
fi

echo ""
echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════${NC}"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✓ Limpeza concluída com sucesso! [${LABEL}]${NC}"
else
  echo -e "${YELLOW}${BOLD} Limpeza concluída com ${ERRORS} erro(s). [${LABEL}]${NC}"
  echo -e "${YELLOW}  Verifique os logs acima para mais detalhes.${NC}"
fi
echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""

exit $ERRORS