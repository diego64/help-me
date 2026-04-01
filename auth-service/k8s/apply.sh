#!/usr/bin/env bash
# =============================================================
# apply.sh — Sobe o auth-service no Kubernetes local
# Compatível com: minikube | kind | Docker Desktop
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="diegoferreira/helpme-auth-service:latest"
NAMESPACE="helpme"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ─────────────────────────────────────────────
# 1. Pré-requisitos
# ─────────────────────────────────────────────
info "Verificando pré-requisitos..."
command -v kubectl &>/dev/null || error "kubectl não encontrado"
command -v docker  &>/dev/null || error "docker não encontrado"

# Detectar ferramenta local
if command -v minikube &>/dev/null && minikube status &>/dev/null 2>&1; then
  TOOL="minikube"
elif command -v kind &>/dev/null && kind get clusters 2>/dev/null | grep -q .; then
  TOOL="kind"
  KIND_CLUSTER=$(kind get clusters | head -1)
else
  TOOL="other"
fi

info "Ferramenta detectada: ${TOOL}"

# ─────────────────────────────────────────────
# 2. Build da imagem Docker
# ─────────────────────────────────────────────
info "Buildando imagem Docker: ${IMAGE}"
docker build -t "${IMAGE}" "${SCRIPT_DIR}/../"
success "Imagem buildada"

# ─────────────────────────────────────────────
# 3. Carregar imagem no cluster local
# ─────────────────────────────────────────────
case "${TOOL}" in
  minikube)
    info "Carregando imagem no minikube..."
    minikube image load "${IMAGE}"
    success "Imagem carregada no minikube"
    ;;
  kind)
    info "Carregando imagem no kind (cluster: ${KIND_CLUSTER})..."
    kind load docker-image "${IMAGE}" --name "${KIND_CLUSTER}"
    success "Imagem carregada no kind"
    ;;
  other)
    warn "Cluster não identificado como minikube/kind."
    warn "Certifique-se de que a imagem '${IMAGE}' está acessível ao cluster."
    ;;
esac

# ─────────────────────────────────────────────
# 4. Garantir que o namespace helpme existe
# ─────────────────────────────────────────────
info "Verificando namespace '${NAMESPACE}'..."
if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
  warn "Namespace '${NAMESPACE}' não existe. Criando..."
  kubectl create namespace "${NAMESPACE}"
  kubectl label namespace "${NAMESPACE}" name="${NAMESPACE}"
  success "Namespace criado"
else
  success "Namespace '${NAMESPACE}' já existe"
fi

# ─────────────────────────────────────────────
# 5. Aplicar manifests em ordem
#    (espelhando a estrutura do api/k8s)
# ─────────────────────────────────────────────

# — namespaces/
info "Aplicando ServiceAccount e ResourceQuota..."
kubectl apply -f "${SCRIPT_DIR}/namespaces/auth-namespace.yaml"

# — application/ (infra antes da app)
info "Aplicando PriorityClass..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-priority-class.yaml"

# — databases/postgres/
info "Aplicando PostgreSQL dedicado..."
kubectl apply -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-secret.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-pvc.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/postgres/auth-postgres-service.yaml"

# — databases/redis/
info "Aplicando Redis dedicado..."
kubectl apply -f "${SCRIPT_DIR}/databases/redis/auth-redis-secret.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/redis/auth-redis-configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/redis/auth-redis-pvc.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/redis/auth-redis-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/databases/redis/auth-redis-service.yaml"

# Aguardar databases
info "Aguardando auth-postgres ficar pronto..."
kubectl rollout status deployment/auth-postgres -n "${NAMESPACE}" --timeout=120s
success "auth-postgres pronto"

info "Aguardando auth-redis ficar pronto..."
kubectl rollout status deployment/auth-redis -n "${NAMESPACE}" --timeout=60s
success "auth-redis pronto"

# — application/ (app)
info "Aplicando ConfigMap, Secret e ResourceQuota da aplicação..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-secret.yaml"
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-resource-quota.yaml"

info "Aplicando Job de migration..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-job-migrate.yaml"
info "Aguardando migration concluir..."
kubectl wait --for=condition=complete job/auth-service-migrate \
  -n "${NAMESPACE}" --timeout=120s
success "Migrations concluídas"

info "Aplicando Deployment, Service, HPA e PDB..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-service.yaml"
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-hpa.yaml"
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-pdb.yaml"

info "Aplicando Network Policy..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-network-policy.yaml"

info "Aplicando ServiceMonitor (Prometheus)..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-service-monitor.yaml" || \
  warn "ServiceMonitor ignorado (Prometheus Operator não instalado)"

info "Aplicando CronJob de backup..."
kubectl apply -f "${SCRIPT_DIR}/application/auth-service-cronjob-backup.yaml"

# — ingress/ (opcional em local — ingress-nginx pode não estar instalado)
info "Aplicando Ingress e rate-limit configmap..."
kubectl apply -f "${SCRIPT_DIR}/ingress/auth-rate-limit-configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/ingress/auth-ingress.yaml" || \
  warn "Ingress ignorado (ingress-nginx pode não estar instalado no cluster local)"

# ─────────────────────────────────────────────
# 6. Aguardar auth-service
# ─────────────────────────────────────────────
info "Aguardando auth-service ficar pronto..."
kubectl rollout status deployment/helpme-auth-service -n "${NAMESPACE}" --timeout=180s
success "auth-service pronto!"

# ─────────────────────────────────────────────
# 7. Informações de acesso local
# ─────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  auth-service rodando no Kubernetes local  ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Para acessar localmente, rode em outro terminal:"
echo -e "  ${YELLOW}kubectl port-forward svc/auth-service 3333:3333 -n ${NAMESPACE}${NC}"
echo ""
echo "Endpoints disponíveis:"
echo "  http://localhost:3333/health"
echo "  http://localhost:3333/auth/v1/usuarios"
echo "  http://localhost:3333/auth/v1/login"
echo ""
echo "Para ver os logs:"
echo -e "  ${YELLOW}kubectl logs -l app=helpme-auth-service -n ${NAMESPACE} -f${NC}"
echo ""
echo "Para limpar tudo ao final:"
echo -e "  ${YELLOW}bash ${SCRIPT_DIR}/delete.sh${NC}"
echo ""
