#!/bin/bash

echo "Diagnóstico da Conexão com Banco de Dados"
echo ""

load_env() {
  local env_file="${1:-.env}"
  
  if [ ! -f "$env_file" ]; then
    return 1
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
  done < "$env_file"
  set +a
  
  return 0
}

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

if load_env "$PROJECT_ROOT/.env"; then
  echo "[INFO] Arquivo .env carregado de: $PROJECT_ROOT/.env"
  echo ""
elif load_env ".env"; then
  echo "[INFO] Arquivo .env carregado do diretório atual"
  echo ""
else
  echo "[ERROR] Arquivo .env não encontrado!"
  echo "[INFO] Procurado em:"
  echo "   - $PROJECT_ROOT/.env"
  echo "   - $(pwd)/.env"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[ERROR] DATABASE_URL não está definida no arquivo .env"
  exit 1
fi

echo "[SUCESSO] DATABASE_URL encontrada"
echo "[INFO] Tipo: string"
echo "[INFO] Tamanho: ${#DATABASE_URL} caracteres"
echo ""

parse_postgres_url() {
  local url="$1"
  local regex='^postgres(ql)?://([^:]+):([^@]+)@([^:]+):([0-9]+)/([^?]+)(\?.*)?$'
  
  if [[ "$url" =~ $regex ]]; then
    DB_USER=$(echo "${BASH_REMATCH[2]}" | sed 's/%40/@/g; s/%23/#/g; s/%24/$/g; s/%25/%/g; s/%26/\&/g; s/%3A/:/g; s/%2F/\//g; s/%3F/?/g; s/%3D/=/g')
    DB_PASSWORD=$(echo "${BASH_REMATCH[3]}" | sed 's/%40/@/g; s/%23/#/g; s/%24/$/g; s/%25/%/g; s/%26/\&/g; s/%3A/:/g; s/%2F/\//g; s/%3F/?/g; s/%3D/=/g')
    DB_HOST="${BASH_REMATCH[4]}"
    DB_PORT="${BASH_REMATCH[5]}"
    DB_DATABASE="${BASH_REMATCH[6]}"
    DB_QUERY_PARAMS="${BASH_REMATCH[7]}"
    return 0
  else
    return 1
  fi
}

if parse_postgres_url "$DATABASE_URL"; then
  echo "[SUCESSO] Parse bem-sucedido da DATABASE_URL"
  echo ""
  echo "[INFO] Configuração extraída:"
  echo "   Host: $DB_HOST"
  echo "   Port: $DB_PORT"
  echo "   Database: $DB_DATABASE"
  
  if [ -n "$DB_QUERY_PARAMS" ]; then
    echo "   Query Params: $DB_QUERY_PARAMS"
    echo "   [INFO] Parâmetros de conexão detectados (usados por ORMs como Prisma)"
  fi
  
  echo "   User: $DB_USER"
  echo "   Password tipo: string"
  echo "   Password definida? $([ -n "$DB_PASSWORD" ] && echo "sim" || echo "não")"
  
  if [ -n "$DB_PASSWORD" ]; then
    echo "   Password tamanho: ${#DB_PASSWORD} caracteres"
    echo "   Password começa com: ${DB_PASSWORD:0:3}..."
    
    declare -a issues=()
    
    if [[ "$DB_PASSWORD" =~ [[:space:]] ]]; then
      issues+=("[WARN]  Senha contém espaços")
    fi
    
    if [[ "$DB_PASSWORD" =~ [\"\'] ]]; then
      issues+=("[WARN]  Senha contém aspas")
    fi
    
    if [[ "$DB_PASSWORD" =~ ^[[:space:]] ]] || [[ "$DB_PASSWORD" =~ [[:space:]]$ ]]; then
      issues+=("[WARN]  Senha tem espaços no início ou fim")
    fi
    
    declare -a special_chars=('@' '#' '$' '%' '&' ':' '/' '?' '=')
    declare -a found_special=()
    
    for char in "${special_chars[@]}"; do
      if [[ "$DB_PASSWORD" == *"$char"* ]]; then
        found_special+=("$char")
      fi
    done
    
    if [ ${#found_special[@]} -gt 0 ]; then
      issues+=("[WARN]  Senha contém caracteres especiais: ${found_special[*]}")
      issues+=("   [INFO] Estes caracteres podem precisar de URL encoding")
    fi
    
    if [ ${#issues[@]} -gt 0 ]; then
      echo ""
      echo "[WARN]  Problemas encontrados:"
      for issue in "${issues[@]}"; do
        echo "   $issue"
      done
    else
      echo ""
      echo "[SUCESSO] Nenhum problema óbvio detectado na senha"
    fi
  else
    echo "   [ERROR] Password não está definida na URL"
  fi
  
  echo ""
  echo "[INFO] Formato esperado da DATABASE_URL:"
  echo "   postgresql://usuario:senha@host:porta/database"
  echo "   postgresql://user:pass@localhost:5432/mydb"
  echo "   postgresql://user:pass@localhost:5432/mydb?connection_limit=15"
  
else
  echo ""
  echo "[ERROR] Erro ao fazer parse da DATABASE_URL"
  echo ""
  echo "[INFO] Sua URL começa com: ${DATABASE_URL:0:30}..."
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "[INFO] Iniciando testes de conexão..."
echo ""

if ! command -v psql &> /dev/null; then
  echo "[WARN]  psql não está instalado, pulando teste de conexão"
  echo "[INFO] Para instalar:"
  echo "   Ubuntu/Debian: sudo apt install postgresql-client"
  echo "   MacOS: brew install postgresql"
  echo "   Fedora: sudo dnf install postgresql"
  echo ""
  exit 0
fi

echo "[1/4] Testando conectividade de rede..."
if command -v nc &> /dev/null; then
  if timeout 3 nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    echo " [SUCESSO] Porta $DB_PORT está acessível em $DB_HOST"
  else
    echo "   [ERROR] Não foi possível conectar em $DB_HOST:$DB_PORT"
    echo ""
    echo "[ERROR] PostgreSQL não está acessível"
    echo "[INFO] Verifique se o PostgreSQL está rodando:"
    echo "   sudo systemctl status postgresql"
    echo "   docker ps | grep postgres"
    exit 1
  fi
else
  echo "   [SKIP] netcat não instalado, pulando teste de porta"
fi

echo ""
echo "[2/4] Testando autenticação no database 'postgres'..."

ERROR_OUTPUT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" 2>&1 >/dev/null)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "   ✓ Autenticação bem-sucedida no database 'postgres'"
  
  echo ""
  echo "[3/4] Listando databases disponíveis..."
  DATABASES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;" 2>/dev/null)
  
  if [ -n "$DATABASES" ]; then
    echo "   Databases encontrados:"
    while IFS= read -r db; do
      db_trimmed=$(echo "$db" | xargs)
      if [ "$db_trimmed" = "$DB_DATABASE" ]; then
        echo "   ✓ $db_trimmed (target)"
      else
        echo "     $db_trimmed"
      fi
    done <<< "$DATABASES"
  fi
  
  echo ""
  echo "[4/4] Testando conexão no database '$DB_DATABASE'..."
  
  TEST_OUTPUT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -c "SELECT NOW() as timestamp, version() as postgres_version;" 2>&1)
  TEST_EXIT=$?
  
  if [ $TEST_EXIT -eq 0 ]; then
    echo "   ✓ Conexão bem-sucedida!"
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "$TEST_OUTPUT"
    echo ""

    echo "[INFO] Informações adicionais do database:"
    
    CONN_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB_DATABASE';" 2>/dev/null | xargs)
    echo "   Conexões ativas: $CONN_COUNT"
    
    TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    echo "   Tabelas no schema public: $TABLE_COUNT"
    
    DB_SIZE=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_DATABASE'));" 2>/dev/null | xargs)
    echo "   Tamanho do database: $DB_SIZE"
    
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "[SUCESSO] Todos os testes passaram! Database está pronto para uso."
    echo ""
    exit 0
    
  else
    echo " [ERROR] Falha ao conectar em '$DB_DATABASE'"
    echo ""
    
    DB_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_DATABASE';" 2>/dev/null | xargs)
    
    if [ -z "$DB_EXISTS" ]; then
      echo "[WARN] Database '$DB_DATABASE' NÃO EXISTE"
      echo ""
      echo "[INFO] Para criar o database, execute:"
      echo "   PGPASSWORD='$DB_PASSWORD' psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c \"CREATE DATABASE \\\"$DB_DATABASE\\\";\""
      echo ""
      echo "   Ou use este comando mais seguro:"
      echo "   createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_DATABASE"
      echo "   (será solicitada a senha)"
      echo ""
      
      read -p "Deseja criar o database agora? (s/N): " -n 1 -r
      echo ""
      if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "[INFO] Criando database '$DB_DATABASE'..."
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_DATABASE\";" 2>/dev/null; then
          echo "[SUCESSO] Database criado com sucesso!"
          
          if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_DATABASE" -c "SELECT 1;" &>/dev/null; then
            echo "[SUCESSO] Conexão ao novo database confirmada!"
            exit 0
          fi
        else
          echo "[ERROR] Falha ao criar database"
        fi
      fi
    else
      echo "[ERROR] Database existe mas não foi possível conectar"
      echo "[INFO] Possíveis causas:"
      echo "   - Usuário '$DB_USER' não tem permissão CONNECT no database"
      echo "   - Database está em modo recovery ou inacessível"
      echo ""
      echo "[INFO] Erro retornado:"
      echo "$TEST_OUTPUT" | head -3
    fi
    
    exit 1
  fi
  
else
  echo "[ERROR] Falha na autenticação"
  echo ""
  echo "[ERROR] Não foi possível autenticar com as credenciais fornecidas"
  echo ""
  
  if echo "$ERROR_OUTPUT" | grep -q "authentication failed"; then
    echo "[INFO] Causa: Senha incorreta ou usuário não existe"
    echo ""
    echo "[DICA] Verifique:"
    echo "   1. A senha está correta no .env?"
    echo "   2. O usuário '$DB_USER' existe no PostgreSQL?"
    echo ""
    echo "[INFO] Para criar o usuário (como superuser do postgres):"
    echo "   sudo -u postgres psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';\""
    echo "   sudo -u postgres psql -c \"ALTER USER $DB_USER CREATEDB;\""
    
  elif echo "$ERROR_OUTPUT" | grep -q "no pg_hba.conf entry"; then
    echo "[INFO] Causa: Configuração pg_hba.conf não permite esta conexão"
    echo ""
    echo "[DICA] Edite o arquivo pg_hba.conf e adicione:"
    echo "   host    all    $DB_USER    $DB_HOST/32    md5"
    echo ""
    echo "[INFO] Localização comum do pg_hba.conf:"
    echo "   /etc/postgresql/*/main/pg_hba.conf"
    echo ""
    echo "[INFO] Após editar, reinicie o PostgreSQL:"
    echo "   sudo systemctl restart postgresql"
    
  else
    echo "[INFO] Erro retornado:"
    echo "$ERROR_OUTPUT" | head -5
  fi
  
  echo ""
  echo "[INFO] Para testar manualmente:"
  echo "   PGPASSWORD='$DB_PASSWORD' psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres"
  echo ""
  
  exit 1
fi