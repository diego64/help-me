#!/bin/sh
# =============================================================
# init-kibana.sh — Bootstrap dos index patterns e dashboards
# Rodado uma única vez pelo container elk-inventory-service-setup
# =============================================================
set -e

KIBANA="${KIBANA_HOST:-http://elk-inventory-service:5601}"
ES="${ES_HOST:-http://elk-inventory-service-es:9200}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── Aguarda Kibana estar disponível ──────────────────────────
log "Aguardando Kibana em $KIBANA..."
until curl -sf "$KIBANA/api/status" | grep -q '"level":"available"'; do
  log "  Kibana não está pronto ainda, aguardando 5s..."
  sleep 5
done
log "Kibana disponível!"

# ── Aguarda Elasticsearch estar com índices sincronizados ────
log "Verificando Elasticsearch em $ES..."
until curl -sf "$ES/_cluster/health?wait_for_status=yellow&timeout=5s" > /dev/null 2>&1; do
  sleep 3
done
log "Elasticsearch disponível!"

# Aguarda mais 5s para garantir que o Kibana terminou de inicializar
sleep 5

HEADER_XSRF="-H 'kbn-xsrf: true'"
HEADER_JSON="-H 'Content-Type: application/json'"

kibana_post() {
  local path="$1"
  local body="$2"
  curl -sf -X POST \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    "$KIBANA$path" \
    -d "$body" \
    > /dev/null 2>&1 || true
}

# =============================================================
# 1. INDEX PATTERNS (Data Views)
# =============================================================
log "Criando index patterns..."

# Logs da aplicação
kibana_post "/api/saved_objects/index-pattern/inv-logs-pattern" '{
  "attributes": {
    "title": "inventory-logs-*",
    "timeFieldName": "@timestamp",
    "fields": "[]"
  }
}'

# Compras
kibana_post "/api/saved_objects/index-pattern/inv-compras-pattern" '{
  "attributes": {
    "title": "inventory-compras-*",
    "timeFieldName": "@timestamp",
    "fields": "[]"
  }
}'

# Reembolsos
kibana_post "/api/saved_objects/index-pattern/inv-reembolsos-pattern" '{
  "attributes": {
    "title": "inventory-reembolsos-*",
    "timeFieldName": "@timestamp",
    "fields": "[]"
  }
}'

# Itens de Inventário
kibana_post "/api/saved_objects/index-pattern/inv-itens-pattern" '{
  "attributes": {
    "title": "inventory-itens-*",
    "timeFieldName": "@timestamp",
    "fields": "[]"
  }
}'

# Movimentações de Estoque
kibana_post "/api/saved_objects/index-pattern/inv-mov-pattern" '{
  "attributes": {
    "title": "inventory-movimentacoes-*",
    "timeFieldName": "@timestamp",
    "fields": "[]"
  }
}'

log "Index patterns criados!"

# =============================================================
# 2. Importa dashboards dos arquivos ndjson
# =============================================================
log "Importando dashboards..."

for file in /dashboards/*.ndjson; do
  name=$(basename "$file")
  log "  Importando $name..."
  curl -sf -X POST \
    -H "kbn-xsrf: true" \
    "$KIBANA/api/saved_objects/_import?overwrite=true" \
    -F "file=@$file" \
    > /dev/null 2>&1 || log "  AVISO: falha ao importar $name (pode já existir)"
done

log "Dashboards importados!"

# =============================================================
# 3. Define data view padrão
# =============================================================
log "Configurando data view padrão para logs..."
kibana_post "/api/kibana/settings" '{
  "changes": {
    "defaultIndex": "inv-logs-pattern"
  }
}' || true

log "=============================================="
log "ELK Stack do Inventory Service inicializado!"
log "Kibana: $KIBANA"
log "Dashboards disponíveis:"
log "  - Monitoramento de Logs"
log "  - Financeiro — Caixa"
log "  - Controle de Inventário"
log "=============================================="
