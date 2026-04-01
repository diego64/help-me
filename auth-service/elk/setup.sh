#!/bin/bash
# =============================================================================
# setup.sh — Configuração pós-start da ELK Stack
# Execute UMA VEZ após o stack subir: bash elk/setup.sh
# Requer: curl, stack rodando via docker-compose.elk.yml
# =============================================================================
set -euo pipefail

ES_URL="${ELASTICSEARCH_HOSTS:-http://localhost:9200}"
KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_TEMPLATE="${SCRIPT_DIR}/elasticsearch/index-template.json"
SAVED_OBJECTS="${SCRIPT_DIR}/kibana/saved-objects.ndjson"

log() { echo "[elk-setup] $*"; }
ok()  { echo "[elk-setup] ✓ $*"; }
err() { echo "[elk-setup] ✗ $*" >&2; }

# =============================================================================
# Aguarda URL responder
# =============================================================================
wait_for() {
  local url="$1" label="$2" max=30 i=0
  log "Aguardando ${label}..."
  until curl -sf "${url}" > /dev/null 2>&1; do
    i=$((i+1))
    [ $i -ge $max ] && { err "${label} não respondeu após $((max * 5))s."; exit 1; }
    sleep 5
  done
  ok "${label} disponível."
}

# =============================================================================
# 1. Elasticsearch — template de índice
# =============================================================================
wait_for "${ES_URL}/_cluster/health?wait_for_status=yellow&timeout=5s" "Elasticsearch"

log "Aplicando template de índice 'auth-service-logs'..."
HTTP=$(curl -sf -o /tmp/es-response.json -w "%{http_code}" \
  -X PUT "${ES_URL}/_index_template/auth-service-logs" \
  -H "Content-Type: application/json" \
  -d @"${INDEX_TEMPLATE}")

if [ "${HTTP}" = "200" ]; then
  ok "Template de índice aplicado (prioridade 200, sobrescreve o do Filebeat)."
else
  err "HTTP ${HTTP} ao aplicar template. Resposta:"; cat /tmp/es-response.json; echo
  exit 1
fi

# =============================================================================
# 2. Kibana — data view (index pattern)
# =============================================================================
wait_for "${KIBANA_URL}/api/status" "Kibana (básico)"

log "Aguardando Kibana ficar operacional..."
max=24; i=0
until curl -sf "${KIBANA_URL}/api/status" | grep -q "available" 2>/dev/null; do
  i=$((i+1))
  [ $i -ge $max ] && { log "Kibana demorou muito — tentando importar assim mesmo..."; break; }
  sleep 5
done
ok "Kibana operacional."

log "Importando data view no Kibana..."
HTTP=$(curl -sf -o /tmp/kibana-response.json -w "%{http_code}" \
  -X POST "${KIBANA_URL}/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@${SAVED_OBJECTS}")

if [ "${HTTP}" = "200" ]; then
  ok "Data view 'auth-service-logs-*' importado com sucesso."
else
  err "HTTP ${HTTP} ao importar data view. Resposta:"; cat /tmp/kibana-response.json; echo
  exit 1
fi

# =============================================================================
# Concluído
# =============================================================================
echo ""
echo "============================================================"
echo "  ELK Stack configurada com sucesso!"
echo ""
echo "  Elasticsearch : ${ES_URL}"
echo "  Kibana        : ${KIBANA_URL}"
echo ""
echo "  Acesse o Kibana → Discover para visualizar os logs."
echo "  Data view: auth-service-logs-*  |  campo de tempo: @timestamp"
echo "============================================================"
echo ""
