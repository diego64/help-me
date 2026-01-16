#!/bin/bash

set -e

echo "════════════════════════════════════════════════════════════"
echo "   USANDO O DATASOURCE EXISTENTE"
echo "════════════════════════════════════════════════════════════"

GRAFANA_URL="http://localhost:3001"
GRAFANA_USER="admin"
GRAFANA_PASS="admin"
EXISTING_UID="PCCC55553A094F547"

echo ""
echo "1. Verificando datasource existente..."
DATASOURCE=$(curl -s -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/datasources/uid/$EXISTING_UID")

echo "$DATASOURCE" | jq .

echo ""
echo "2. Testando saúde do datasource..."
HEALTH=$(curl -s -X GET -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/datasources/uid/$EXISTING_UID/health")

echo "$HEALTH" | jq .

if echo "$HEALTH" | grep -q '"status":"OK"'; then
    echo "[SUCESSO] Datasource funcionando!"
else
    echo "[ERROR]  Datasource com problema, vamos atualizar..."
    
    # Atualizar datasource
    DATASOURCE_ID=$(echo "$DATASOURCE" | jq -r '.id')
    
    curl -s -X PUT -u "$GRAFANA_USER:$GRAFANA_PASS" \
      -H "Content-Type: application/json" \
      "$GRAFANA_URL/api/datasources/$DATASOURCE_ID" \
      -d "{
        \"id\": $DATASOURCE_ID,
        \"uid\": \"$EXISTING_UID\",
        \"name\": \"PostgreSQL Helpdesk\",
        \"type\": \"grafana-postgresql-datasource\",
        \"access\": \"proxy\",
        \"url\": \"postgresql_helpme:5432\",
        \"database\": \"helpme-database\",
        \"user\": \"administrador\",
        \"secureJsonData\": {
          \"password\": \"1qaz2wsx3edc\"
        },
        \"jsonData\": {
          \"sslmode\": \"disable\",
          \"postgresVersion\": 1400,
          \"timescaledb\": false,
          \"maxOpenConns\": 10,
          \"maxIdleConns\": 2,
          \"connMaxLifetime\": 14400
        },
        \"isDefault\": true
      }" | jq .
    
    echo ""
    echo "Aguardando 3 segundos..."
    sleep 3
    
    echo ""
    echo "Testando novamente..."
    HEALTH2=$(curl -s -X GET -u "$GRAFANA_USER:$GRAFANA_PASS" \
      "$GRAFANA_URL/api/datasources/uid/$EXISTING_UID/health")
    echo "$HEALTH2" | jq .
fi

echo ""
echo "3. Criando dashboard com o UID correto..."

cat > /tmp/dashboard-correto.json << EOJSON
{
  "dashboard": {
    "title": "Help-Me - Dashboard",
    "uid": "helpme-dashboard-final",
    "timezone": "America/Sao_Paulo",
    "refresh": "1m",
    "time": {
      "from": "now-30d",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "type": "stat",
        "title": "Total de Chamados",
        "gridPos": {"h": 7, "w": 4, "x": 0, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#FF9830", "value": null}]
            }
          }
        }
      },
      {
        "id": 2,
        "type": "stat",
        "title": "Abertos",
        "gridPos": {"h": 7, "w": 4, "x": 4, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status = 'ABERTO' AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#5794F2", "value": null}]
            }
          }
        }
      },
      {
        "id": 3,
        "type": "stat",
        "title": "Em Atendimento",
        "gridPos": {"h": 7, "w": 4, "x": 8, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status = 'EM_ATENDIMENTO' AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#FADE2A", "value": null}]
            }
          }
        }
      },
      {
        "id": 4,
        "type": "stat",
        "title": "Encerrados",
        "gridPos": {"h": 7, "w": 4, "x": 12, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status = 'ENCERRADO' AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#73BF69", "value": null}]
            }
          }
        }
      },
      {
        "id": 5,
        "type": "stat",
        "title": "Cancelados",
        "gridPos": {"h": 7, "w": 4, "x": 16, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status = 'CANCELADO' AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#F2495C", "value": null}]
            }
          }
        }
      },
      {
        "id": 6,
        "type": "stat",
        "title": "Reabertos",
        "gridPos": {"h": 7, "w": 4, "x": 20, "y": 0},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status = 'REABERTO' AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "#B877D9", "value": null}]
            }
          }
        }
      },
      {
        "id": 7,
        "type": "stat",
        "title": "SLA 24h",
        "gridPos": {"h": 7, "w": 6, "x": 0, "y": 7},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COALESCE(ROUND((COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600 <= 24)::numeric / NULLIF(COUNT(*), 0) * 100), 2), 0) as value FROM chamados WHERE encerrado_em IS NOT NULL AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "area",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "max": 100,
            "min": 0,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "red", "value": null},
                {"color": "orange", "value": 70},
                {"color": "yellow", "value": 85},
                {"color": "green", "value": 95}
              ]
            }
          }
        }
      },
      {
        "id": 8,
        "type": "stat",
        "title": "Tempo Médio (h)",
        "gridPos": {"h": 7, "w": 6, "x": 6, "y": 7},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (encerrado_em - gerado_em)) / 3600)::numeric, 1), 0) as value FROM chamados WHERE encerrado_em IS NOT NULL AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "area",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "h",
            "decimals": 1,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 24},
                {"color": "orange", "value": 48},
                {"color": "red", "value": 72}
              ]
            }
          }
        }
      },
      {
        "id": 9,
        "type": "stat",
        "title": "Vencidos (>24h)",
        "gridPos": {"h": 7, "w": 6, "x": 12, "y": 7},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COUNT(*) as value FROM chamados WHERE status IN ('ABERTO', 'EM_ATENDIMENTO') AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - gerado_em)) / 3600 > 24 AND deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "none",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 5},
                {"color": "orange", "value": 15},
                {"color": "red", "value": 25}
              ]
            }
          }
        }
      },
      {
        "id": 10,
        "type": "stat",
        "title": "Taxa Resolução",
        "gridPos": {"h": 7, "w": 6, "x": 18, "y": 7},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT COALESCE(ROUND((COUNT(*) FILTER (WHERE status = 'ENCERRADO')::numeric / NULLIF(COUNT(*), 0) * 100), 2), 0) as value FROM chamados WHERE deletado_em IS NULL",
            "format": "table"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name",
          "colorMode": "value",
          "graphMode": "area",
          "justifyMode": "center",
          "orientation": "auto"
        },
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "max": 100,
            "min": 0,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "red", "value": null},
                {"color": "orange", "value": 50},
                {"color": "yellow", "value": 70},
                {"color": "green", "value": 85}
              ]
            }
          }
        }
      },
      {
        "id": 11,
        "type": "table",
        "title": "Chamados Ativos - Últimos 50",
        "gridPos": {"h": 12, "w": 24, "x": 0, "y": 14},
        "targets": [
          {
            "refId": "A",
            "datasource": {
              "type": "grafana-postgresql-datasource",
              "uid": "$EXISTING_UID"
            },
            "rawSql": "SELECT c.\"OS\" as \"OS\", SUBSTRING(c.descricao, 1, 60) as \"Descrição\", c.status as \"Status\", COALESCE(t.nome || ' ' || t.sobrenome, 'SEM TÉCNICO') as \"Técnico\", u.setor::text as \"Setor\", ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.gerado_em)) / 3600::numeric, 1) as \"Tempo (h)\", TO_CHAR(c.gerado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') as \"Criado\" FROM chamados c LEFT JOIN usuarios t ON c.tecnico_id = t.id LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.status IN ('ABERTO', 'EM_ATENDIMENTO', 'REABERTO') AND c.deletado_em IS NULL ORDER BY c.gerado_em DESC LIMIT 50",
            "format": "table"
          }
        ],
        "options": {
          "showHeader": true,
          "cellHeight": "sm",
          "footer": {
            "show": false
          }
        }
      }
    ]
  },
  "overwrite": true
}
EOJSON

RESULT=$(curl -s -X POST -u "$GRAFANA_USER:$GRAFANA_PASS" \
  -H "Content-Type: application/json" \
  "$GRAFANA_URL/api/dashboards/db" \
  -d @/tmp/dashboard-correto.json)

echo "$RESULT" | jq .

if echo "$RESULT" | grep -q '"status":"success"'; then
    DASHBOARD_URL=$(echo "$RESULT" | jq -r '.url')
    echo ""
    echo "[SUCESSO] DASHBOARD CRIADO COM SUCESSO!"
    echo ""
    echo "Acesse: $GRAFANA_URL$DASHBOARD_URL"
else
    echo ""
    echo "[ERROR] Erro ao criar dashboard"
fi

rm -f /tmp/dashboard-correto.json

echo ""
echo "════════════════════════════════════════════════════════════"