#!/bin/bash

echo "🔍 Diagnóstico da API para Testes K6"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. VERIFICAR SE A API ESTÁ RODANDO
echo "1️⃣  Verificando se a API está rodando..."
API_URL="http://localhost:3000"

if curl -s -o /dev/null -w "%{http_code}" "$API_URL" > /dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL")
    echo -e "${GREEN}✅ API respondendo em $API_URL (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ API NÃO está respondendo em $API_URL${NC}"
    echo ""
    echo "💡 Soluções:"
    echo "   1. Inicie a API: pnpm dev"
    echo "   2. Verifique se está rodando em outra porta"
    echo "   3. Verifique os logs da API"
    exit 1
fi

echo ""

# 2. TESTAR ROTA DE LOGIN
echo "2️⃣  Testando rota de login..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helpme.com","password":"Admin123!"}' \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | grep "HTTP_CODE" | cut -d':' -f2)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Login funcionando (HTTP 200)${NC}"
    echo "   Response: ${RESPONSE_BODY:0:100}..."
else
    echo -e "${RED}❌ Login falhou (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $RESPONSE_BODY"
    echo ""
    echo "💡 Possíveis causas:"
    echo "   1. Seed não foi executado: pnpm prisma db seed"
    echo "   2. Credenciais incorretas no seed"
    echo "   3. Rota de login com problema"
fi

echo ""

# 3. VERIFICAR SE O BANCO TEM DADOS
echo "3️⃣  VERIFICANDO DADOS DO SEED..."

# TENTA FAZER LOGIN E CONTAR USUÁRIOS
TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    USUARIOS_RESPONSE=$(curl -s "$API_URL/usuario" \
      -H "Authorization: Bearer $TOKEN" \
      -w "\nHTTP_CODE:%{http_code}")
    
    USUARIOS_HTTP=$(echo "$USUARIOS_RESPONSE" | grep "HTTP_CODE" | cut -d':' -f2)
    USUARIOS_BODY=$(echo "$USUARIOS_RESPONSE" | sed '/HTTP_CODE/d')
    
    if [ "$USUARIOS_HTTP" = "200" ]; then
        USUARIOS_COUNT=$(echo "$USUARIOS_BODY" | grep -o '"id"' | wc -l)
        echo -e "${GREEN}✅ Banco populado: $USUARIOS_COUNT usuários encontrados${NC}"
    else
        echo -e "${YELLOW}⚠️  Não foi possível verificar usuários (HTTP $USUARIOS_HTTP)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Não foi possível obter token para verificar dados${NC}"
fi

echo ""

# 4. VERIFICAR PORTAS EM USO
echo "4️⃣  VERIFICANDO PORTAS EM USO..."

if command -v lsof &> /dev/null; then
    PORT_3000=$(lsof -i :3000 -t 2>/dev/null)
    if [ -n "$PORT_3000" ]; then
        echo -e "${GREEN}✅ Porta 3000 em uso (PID: $PORT_3000)${NC}"
    else
        echo -e "${RED}❌ Porta 3000 livre (API não está rodando?)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  lsof não disponível, pulando verificação de porta${NC}"
fi

echo ""

# 5. VERIFICAR ARQUIVO DE ROTAS K6
echo "5️⃣  Verificando arquivo k6-routes.json..."

# Detectar o diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6_ROUTES_PATH="$SCRIPT_DIR/k6-routes.json"

if [ -f "$K6_ROUTES_PATH" ]; then
    echo -e "${GREEN}✅ Arquivo k6-routes.json existe${NC}"
    echo "   Localização: $K6_ROUTES_PATH"
    
    # VERIFICAR SE TEM CONTEÚDO
    if [ -s "$K6_ROUTES_PATH" ]; then
        ROTAS_COUNT=$(grep -o '"method"' "$K6_ROUTES_PATH" | wc -l)
        echo "   Rotas encontradas: $ROTAS_COUNT"
    else
        echo -e "${RED}❌ Arquivo k6-routes.json está vazio${NC}"
    fi
else
    echo -e "${RED}❌ Arquivo k6-routes.json não existe${NC}"
    echo "   Caminho esperado: $K6_ROUTES_PATH"
    echo "   Execute: pnpm run extracao-de-rotas"
fi

echo ""

# 6. RESUMO E PRÓXIMOS PASSOS
echo "═══════════════════════════════════════════════════════"
echo "📊 RESUMO DO DIAGNÓSTICO"
echo "═══════════════════════════════════════════════════════"
echo ""

if [ "$HTTP_CODE" = "200" ] && [ -f "$K6_ROUTES_PATH" ]; then
    echo -e "${GREEN}✅ Tudo OK! Você pode executar os testes K6:${NC}"
    echo ""
    echo "   pnpm run teste-de-carga"
    echo ""
else
    echo -e "${RED}❌ Problemas detectados. Siga estes passos:${NC}"
    echo ""
    echo "   1. Inicie a API:"
    echo "      pnpm dev"
    echo ""
    echo "   2. Execute o seed:"
    echo "      pnpm prisma db seed"
    echo ""
    echo "   3. Gere as rotas:"
    echo "      pnpm run extracao-de-rotas"
    echo ""
    echo "   4. Execute os testes:"
    echo "      pnpm run teste-de-carga"
fi

echo ""