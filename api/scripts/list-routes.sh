#!/bin/bash

echo "[INFO] Listando rotas do projeto"
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
ROUTES_DIR="$PROJECT_ROOT/src/routes"

if [ ! -d "$ROUTES_DIR" ]; then
  echo "[ERROR] Pasta de rotas não encontrada: $ROUTES_DIR"
  echo ""
  echo "[INFO] Estrutura esperada:"
  echo "   $PROJECT_ROOT/"
  echo "   └── src/"
  echo "       └── routes/"
  echo ""
  exit 1
fi

echo "[INFO] Escaneando rotas em: $ROUTES_DIR"
echo ""

TOTAL_ROUTES=0
TOTAL_FILES=0

declare -a ALL_ROUTES=()

scan_file() {
  local file_path="$1"
  local file_name=$(basename "$file_path")
  
  declare -a file_routes=()
  
  while IFS= read -r line; do
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^// ]] && continue
    [[ "$line" =~ ^/\* ]] && continue
    [[ "$line" =~ ^\* ]] && continue
    
    local method=""
    local route_path=""
    

    if [[ "$line" =~ (router|app|route)\.(get|post|put|delete|patch|options|head)[[:space:]]*\([[:space:]]*\'([^\']+)\' ]]; then
      method="${BASH_REMATCH[2]}"
      route_path="${BASH_REMATCH[3]}"

    elif [[ "$line" =~ (router|app|route)\.(get|post|put|delete|patch|options|head)[[:space:]]*\([[:space:]]*\"([^\"]+)\" ]]; then
      method="${BASH_REMATCH[2]}"
      route_path="${BASH_REMATCH[3]}"

    elif [[ "$line" =~ \.(get|post|put|delete|patch|options|head)[[:space:]]*\([[:space:]]*\'([^\']+)\' ]]; then
      method="${BASH_REMATCH[1]}"
      route_path="${BASH_REMATCH[2]}"

    elif [[ "$line" =~ \.(get|post|put|delete|patch|options|head)[[:space:]]*\([[:space:]]*\"([^\"]+)\" ]]; then
      method="${BASH_REMATCH[1]}"
      route_path="${BASH_REMATCH[2]}"
    fi
    
    if [ -n "$method" ] && [ -n "$route_path" ]; then
      method=$(echo "$method" | tr '[:lower:]' '[:upper:]')
      file_routes+=("$method|$route_path")
    fi
    
  done < "$file_path"
  
  if [ ${#file_routes[@]} -gt 0 ]; then
    echo "[INFO] Arquivo: $file_name"
    ((TOTAL_FILES++))
    
    for route in "${file_routes[@]}"; do
      IFS='|' read -r method path <<< "$route"
      printf "%-8s %s\n" "$method" "$path"
      
      ((TOTAL_ROUTES++))
      ALL_ROUTES+=("$method|$path|$file_name")
    done
    
    echo ""
  fi
}

echo "════════════════════════════════════════════════════════════"
echo ""

shopt -s nullglob
files=("$ROUTES_DIR"/*.ts "$ROUTES_DIR"/*.js)

if [ ${#files[@]} -eq 0 ]; then
  echo "[WARN] Nenhum arquivo .ts ou .js encontrado em $ROUTES_DIR"
  echo ""
  exit 0
fi

echo "[INFO] Arquivos encontrados: ${#files[@]}"
for file in "${files[@]}"; do
  echo "   - $(basename "$file")"
done
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    scan_file "$file"
  fi
done

echo "════════════════════════════════════════════════════════════"
echo ""

if [ $TOTAL_ROUTES -eq 0 ]; then
  echo "[WARN] Nenhuma rota encontrada!"
  echo ""
  echo "[INFO] Padrões suportados:"
  echo "   router.get('/path', handler)"
  echo "   app.post('/path', handler)"
  echo "   route.put('/path', handler)"
  echo "   .delete('/path', handler)"
  echo ""
  echo "[DICA] Verifique se os arquivos contêm definições de rotas"
  exit 0
fi

echo "[SUMMARY] Resumo do escaneamento:"
echo "   Arquivos com rotas: $TOTAL_FILES"
echo "   Total de rotas: $TOTAL_ROUTES"
echo ""

echo "[INFO] Distribuição por método HTTP:"

declare -A method_counts

for route in "${ALL_ROUTES[@]}"; do
  IFS='|' read -r method path file <<< "$route"
  ((method_counts[$method]++))
done

for method in GET POST PUT DELETE PATCH OPTIONS HEAD; do
  if [ -n "${method_counts[$method]}" ]; then
    count=${method_counts[$method]}
    percentage=$(awk "BEGIN {printf \"%.1f\", ($count / $TOTAL_ROUTES) * 100}")
    printf "   %-8s %2d rotas (%s%%)\n" "$method" "$count" "$percentage"
  fi
done

echo ""

echo "[INFO] Distribuição por arquivo:"

declare -A file_counts

for route in "${ALL_ROUTES[@]}"; do
  IFS='|' read -r method path file <<< "$route"
  ((file_counts[$file]++))
done

for file in $(printf '%s\n' "${!file_counts[@]}" | sort); do
  count=${file_counts[$file]}
  printf "   %-30s %2d rotas\n" "$file" "$count"
done

echo ""

echo "[INFO] Todas as rotas (ordenadas por método e caminho):"
echo ""

IFS=$'\n' sorted=($(sort -t'|' -k1,1 -k2,2 <<<"${ALL_ROUTES[*]}"))
unset IFS

printf "%-8s %-45s %-25s\n" "MÉTODO" "CAMINHO" "ARQUIVO"
printf "%-8s %-45s %-25s\n" "------" "-------" "-------"

for route in "${sorted[@]}"; do
  IFS='|' read -r method path file <<< "$route"
  printf "%-8s %-45s %-25s\n" "$method" "$path" "$file"
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

echo "[INFO] Verificando rotas duplicadas..."

declare -A route_map
duplicates_found=0

for route in "${ALL_ROUTES[@]}"; do
  IFS='|' read -r method path file <<< "$route"
  key="$method|$path"
  
  if [ -n "${route_map[$key]}" ]; then
    echo "[WARN] Rota duplicada: $method $path"
    echo "   Arquivos: ${route_map[$key]} e $file"
    ((duplicates_found++))
  else
    route_map[$key]="$file"
  fi
done

if [ $duplicates_found -eq 0 ]; then
  echo "   Nenhuma rota duplicada encontrada"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "[SUCESSO] Escaneamento concluído!"
echo ""