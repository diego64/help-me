#!/bin/bash

echo "[INFO] Diagnóstico de Carregamento do .env"
echo ""
echo "[INFO] Diretório de trabalho: $(pwd)"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_project_root() {
  local current_dir="$1"
  for i in {1..5}; do
    if [ -f "$current_dir/package.json" ]; then
      echo "$current_dir"
      return 0
    fi
    current_dir="$(dirname "$current_dir")"
  done
  
  echo "$SCRIPT_DIR"
}

PROJECT_ROOT=$(find_project_root "$SCRIPT_DIR")

echo "[INFO] Diretório do script: $SCRIPT_DIR"
echo "[INFO] Raiz do projeto detectada: $PROJECT_ROOT"

if [ -f "$PROJECT_ROOT/package.json" ]; then
  echo "[INFO] package.json encontrado"
else
  echo "[WARN] package.json não encontrado, usando diretório do script"
fi
echo ""

POSSIVEIS_LOCAIS=(
  "$PROJECT_ROOT/.env"
  "$PROJECT_ROOT/.env.local"
  "$PROJECT_ROOT/.env.test"
  "$SCRIPT_DIR/../.env"
  ".env"
  "$(pwd)/.env"
)

echo "[INFO] Procurando arquivo .env:"
echo ""

ENV_ENCONTRADO=false
ENV_PATH=""

for LOCAL in "${POSSIVEIS_LOCAIS[@]}"; do
  if [ -f "$LOCAL" ]; then
    ABSOLUTE_PATH=$(realpath "$LOCAL" 2>/dev/null || readlink -f "$LOCAL" 2>/dev/null || echo "$LOCAL")
    
    echo "[SUCESSO] Encontrado: $LOCAL"
    echo "   Caminho absoluto: $ABSOLUTE_PATH"
    
    if [ "$ENV_ENCONTRADO" = false ]; then
      echo "   Este será usado!"
      ENV_ENCONTRADO=true
      ENV_PATH="$LOCAL"
    fi
    echo ""
  fi
done

if [ "$ENV_ENCONTRADO" = false ]; then
  echo "[ERROR] Nenhum arquivo .env encontrado!"
  echo ""
  echo "[INFO] Soluções:"
  echo "   1. Crie um arquivo .env na raiz do projeto: $PROJECT_ROOT/.env"
  echo "   2. Copie o .env.example: cp $PROJECT_ROOT/.env.example $PROJECT_ROOT/.env"
  echo "   3. Verifique se o arquivo se chama exatamente \".env\""
  echo ""
  echo "[INFO] Tentei procurar em:"
  for LOCAL in "${POSSIVEIS_LOCAIS[@]}"; do
    echo "   - $LOCAL"
  done
  echo ""
  
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    echo "[INFO] Encontrei .env.example em: $PROJECT_ROOT/.env.example"
    echo "[DICA] Execute: cp $PROJECT_ROOT/.env.example $PROJECT_ROOT/.env"
    echo ""
  fi
  
  exit 1
fi

echo "════════════════════════════════════════════════════════════"
echo ""
echo "[INFO] Carregando .env de: $ENV_PATH"
echo ""

if [ ! -r "$ENV_PATH" ]; then
  echo "[ERROR] Arquivo .env não pode ser lido (permissões?)"
  exit 1
fi

set -a
while IFS= read -r line || [ -n "$line" ]; do
  line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  
  if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=[\'\"](.+)[\'\"]$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    else
      export "$line"
    fi
  fi
done < "$ENV_PATH"
set +a

echo "[SUCESSO] Arquivo .env carregado com sucesso!"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "[INFO] Variáveis de ambiente carregadas:"
echo ""

VAR_COUNT=$(grep -c "^[^#[:space:]].*=" "$ENV_PATH" 2>/dev/null || echo "0")

if [ "$VAR_COUNT" -eq 0 ]; then
  echo "[WARN]  Nenhuma variável encontrada no .env"
  echo ""
else
  echo "Total: $VAR_COUNT variáveis"
  echo ""
  
  declare -A FOUND_VARS

  while IFS='=' read -r KEY REST; do
    KEY=$(echo "$KEY" | xargs)
    [[ -z "$KEY" || "$KEY" =~ ^# ]] && continue
    FOUND_VARS[$KEY]=1
    VALUE="${!KEY}"
    
    if [ -z "$VALUE" ]; then
      VALUE=$(echo "$REST" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed "s/^['\"]//;s/['\"]$//")
    fi
    
    DISPLAY_VALUE="$VALUE"
    
    if [[ "$KEY" =~ [Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd] ]] || \
       [[ "$KEY" =~ [Ss][Ee][Cc][Rr][Ee][Tt] ]] || \
       [[ "$KEY" =~ [Kk][Ee][Yy] ]] || \
       [[ "$KEY" =~ [Tt][Oo][Kk][Ee][Nn] ]] || \
       [ "$KEY" = "DATABASE_URL" ]; then
      
      if [ "$KEY" = "DATABASE_URL" ]; then
        if [[ "$VALUE" =~ ://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
          DISPLAY_VALUE="postgresql://***:***@${BASH_REMATCH[3]}:${BASH_REMATCH[4]}/${BASH_REMATCH[5]}"
        else
          DISPLAY_VALUE="${VALUE:0:20}..."
        fi
      else
        if [ -n "$VALUE" ]; then
          DISPLAY_VALUE="${VALUE:0:3}***"
        else
          DISPLAY_VALUE="(vazio)"
        fi
      fi
    fi
    
    echo "  $KEY: $DISPLAY_VALUE"
    
  done < <(grep "^[^#[:space:]].*=" "$ENV_PATH")
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "[INFO] Verificação específica de DATABASE_URL:"
echo ""

if [ -n "$DATABASE_URL" ]; then
  echo "[SUCESSO] DATABASE_URL está definida"
  echo "[INFO] Tipo: string"
  echo "[INFO] Tamanho: ${#DATABASE_URL} caracteres"
  
  if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)$ ]]; then
    echo ""
    echo "[INFO] Componentes da URL:"
    echo "   Protocolo: postgresql://"
    echo "   Usuário: ${BASH_REMATCH[2]}"
    echo "   Senha: *** (${#BASH_REMATCH[3]} caracteres)"
    echo "   Host: ${BASH_REMATCH[4]}"
    echo "   Porta: ${BASH_REMATCH[5]}"
    echo "   Database: ${BASH_REMATCH[6]}"
  else
    echo ""
    echo "[WARN] Formato da DATABASE_URL parece inválido"
    echo "[INFO] Formato esperado: postgresql://user:password@host:port/database"
  fi
else
  echo "[ERROR] DATABASE_URL NÃO está definida"
  echo ""
  echo "[INFO] Verifique se:"
  echo "   1. A linha DATABASE_URL=... existe no .env"
  echo "   2. Não há espaços antes do nome da variável"
  echo "   3. Não há aspas incorretas ao redor do valor"
  echo "   4. O arquivo .env está em: $PROJECT_ROOT/.env"
  echo ""
  echo "[INFO] Exemplo de linha válida:"
  echo "   DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "[SUCESSO] Diagnóstico concluído!"
echo ""

if [ -n "$DATABASE_URL" ]; then
  echo "[SUCESSO] Tudo OK! Limpeza da base de dados pode ser executada."
  echo ""
  exit 0
else
  echo "[WARN]  Corrija o problema acima antes de continuar."
  echo ""
  exit 1
fi