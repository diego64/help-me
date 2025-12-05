#!/bin/bash

# Script para popular banco com dados de teste

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Popular Banco com Dados de Teste         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

BASE_URL="http://localhost:3000"
TOKEN=""

# 1. Fazer login
echo -e "${YELLOW}[1/5] Fazendo login...${NC}"
echo ""

LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helpme.com","password":"Admin123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo -e "  ${GREEN}[SUCESSO] Login OK${NC}"
    echo "  Token: ${TOKEN:0:30}..."
else
    echo -e "  ${RED}❌ Falha no login${NC}"
    exit 1
fi

# 2. Criar serviços
echo ""
echo -e "${YELLOW}[2/5] Criando serviços...${NC}"
echo ""

for i in {1..10}; do
    curl -s -X POST $BASE_URL/servico/ \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"nome\": \"Serviço $i\",
        \"descricao\": \"Descrição do serviço $i\",
        \"tempoEstimado\": $((30 + i * 10))
      }" > /dev/null
done

echo -e "  ${GREEN}[SUCESSO] 10 serviços criados${NC}"

# 3. Criar usuários
echo ""
echo -e "${YELLOW}[3/5] Criando usuários...${NC}"
echo ""

for i in {1..30}; do
    CPF=$((10000000000 + i))
    curl -s -X POST $BASE_URL/usuario/ \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"nome\": \"Usuario\",
        \"sobrenome\": \"Teste $i\",
        \"email\": \"usuario${i}@test.com\",
        \"senha\": \"senha123\",
        \"cpf\": \"$CPF\"
      }" > /dev/null
done

echo -e "  ${GREEN}[SUCESSO] 30 usuários criados${NC}"

# 4. Criar técnicos
echo ""
echo -e "${YELLOW}[4/5] Criando técnicos...${NC}"
echo ""

for i in {1..15}; do
    curl -s -X POST $BASE_URL/tecnico/ \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"nome\": \"Tecnico\",
        \"sobrenome\": \"$i\",
        \"email\": \"tecnico${i}@test.com\",
        \"senha\": \"senha123\",
        \"especialidade\": \"Rede\"
      }" > /dev/null
done

echo -e "  ${GREEN}[SUCESSO] 15 técnicos criados${NC}"

# 5. Criar chamados
echo ""
echo -e "${YELLOW}[5/5] Criando chamados...${NC}"
echo ""

for i in {1..100}; do
    SERVICO_ID=$((1 + i % 10))
    PRIORIDADE=$((1 + i % 3))
    
    curl -s -X POST $BASE_URL/chamado/abertura-chamado \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"titulo\": \"Chamado de Teste $i\",
        \"descricao\": \"Descrição do chamado de teste número $i\",
        \"prioridade\": \"$PRIORIDADE\",
        \"servicoId\": \"$SERVICO_ID\"
      }" > /dev/null
done

echo -e "  ${GREEN}[SUCESSO] 100 chamados criados${NC}"

# Resumo
echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}RESUMO${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Banco populado com sucesso!${NC}"
echo ""
echo "Dados criados:"
echo "- 10 serviços"
echo "- 30 usuários"
echo "- 15 técnicos"
echo "- 100 chamados"
echo ""
echo "Agora o teste deve ter:"
echo "- Menos erros 404"
echo "- http_req_failed < 25%"
echo ""
echo "Executar teste:"
echo "  k6 run spike.js"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""