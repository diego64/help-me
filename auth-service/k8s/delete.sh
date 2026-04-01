#!/usr/bin/env bash
# =============================================================
# delete.sh — Remove todos os recursos do auth-service do k8s
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="helpme"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }

echo -e "${RED}════════════════════════════════════════════${NC}"
echo -e "${RED}  Removendo auth-service do Kubernetes      ${NC}"
echo -e "${RED}════════════════════════════════════════════${NC}"
echo ""
read -r -p "Confirma remoção de TODOS os recursos do auth-service? (s/N): " confirm
[[ "${confirm}" =~ ^[sS]$ ]] || { warn "Cancelado."; exit 0; }

# — ingress/
info "Removendo Ingress..."
kubectl delete -f "${SCRIPT_DIR}/ingress/auth-ingress.yaml"          --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/ingress/auth-rate-limit-configmap.yaml" --ignore-not-found

# — application/
info "Removendo recursos da aplicação..."
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-network-policy.yaml"  --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-cronjob-backup.yaml"  --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-service-monitor.yaml" --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-pdb.yaml"             --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-hpa.yaml"             --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-service.yaml"         --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-deployment.yaml"      --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-job-migrate.yaml"     --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-resource-quota.yaml"  --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-secret.yaml"          --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-configmap.yaml"       --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/application/auth-service-priority-class.yaml"  --ignore-not-found

# — databases/redis/
info "Removendo Redis..."
kubectl delete -f "${SCRIPT_DIR}/databases/redis/auth-redis-deployment.yaml" --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/databases/redis/auth-redis-service.yaml"    --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/databases/redis/auth-redis-configmap.yaml"  --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/databases/redis/auth-redis-secret.yaml"     --ignore-not-found

# — databases/postgres/
info "Removendo PostgreSQL..."
kubectl delete -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-deployment.yaml" --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-service.yaml"    --ignore-not-found
kubectl delete -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-secret.yaml"     --ignore-not-found

# — namespaces/
info "Removendo ServiceAccount e ResourceQuota..."
kubectl delete -f "${SCRIPT_DIR}/namespaces/auth-namespace.yaml" --ignore-not-found

# PVCs (dados persistentes — pergunta separada)
echo ""
read -r -p "Remover também os PersistentVolumeClaims (apaga os dados do banco e backups)? (s/N): " confirm_pvc
if [[ "${confirm_pvc}" =~ ^[sS]$ ]]; then
  info "Removendo PVCs..."
  kubectl delete -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-pvc.yaml" --ignore-not-found
  kubectl delete -f "${SCRIPT_DIR}/databases/redis/auth-redis-pvc.yaml"       --ignore-not-found
  kubectl delete pvc auth-backup-pvc -n "${NAMESPACE}"                        --ignore-not-found
  success "PVCs removidos"
else
  warn "PVCs mantidos. Para remover manualmente:"
  warn "  kubectl delete pvc auth-postgres-pvc auth-redis-pvc auth-backup-pvc -n ${NAMESPACE}"
fi

echo ""
success "Todos os recursos do auth-service foram removidos."
