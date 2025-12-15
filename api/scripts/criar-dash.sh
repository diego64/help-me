#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Iniciando criação da estrutura de dashboards...${NC}"

# Verificar se precisa de sudo
SUDO=""
if [ ! -w "$(dirname "$0")/.." ]; then
    echo -e "${YELLOW}Permissões necessárias. Usando sudo...${NC}"
    SUDO="sudo"
fi

# Diretório base (um nível acima)
BASE_DIR="../dash"

# Remover estrutura antiga se existir
if [ -d "${BASE_DIR}" ]; then
    echo -e "${YELLOW}Removendo estrutura antiga...${NC}"
    $SUDO rm -rf "${BASE_DIR}"
fi

# Criar diretório principal
echo -e "${YELLOW}Criando diretório base: ${BASE_DIR}${NC}"
$SUDO mkdir -p "${BASE_DIR}"

# ============================================
# ESTRUTURA GRAFANA
# ============================================
echo -e "${YELLOW}Criando estrutura do Grafana...${NC}"

# Criar pasta grafana/dashboards
$SUDO mkdir -p "${BASE_DIR}/grafana/dashboards"

# Criar pasta grafana/provisioning/dashboards
$SUDO mkdir -p "${BASE_DIR}/grafana/provisioning/dashboards"

# Criar pasta grafana/provisioning/datasources
$SUDO mkdir -p "${BASE_DIR}/grafana/provisioning/datasources"

# ============================================
# ARQUIVO: helpme-chamados.json
# ============================================
echo -e "${YELLOW}Criando dashboard helpme-chamados.json...${NC}"
$SUDO cat > "${BASE_DIR}/grafana/dashboards/helpme-chamados.json" << 'EOF'
{
  "annotations": {
    "list": []
  },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "liveNow": false,
  "panels": [
    {
      "datasource": {
        "type": "postgres",
        "uid": "PCCC55553A094F547"
      },
      "description": "Visão geral de todos os chamados por status",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "max": 500,
          "min": 0,
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "blue",
                "value": null
              }
            ]
          },
          "unit": "short"
        },
        "overrides": [
          {
            "matcher": {
              "id": "byName",
              "options": "Total"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#FF9830",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 600
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Aberto"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#5794F2",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 200
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Em Atendimento"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#FADE2A",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 300
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Encerrado"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#73BF69",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 400
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Cancelado"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#F2495C",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 100
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Reaberto"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "mode": "thresholds"
                }
              },
              {
                "id": "thresholds",
                "value": {
                  "mode": "absolute",
                  "steps": [
                    {
                      "color": "#B877D9",
                      "value": null
                    }
                  ]
                }
              },
              {
                "id": "max",
                "value": 50
              }
            ]
          }
        ]
      },
      "gridPos": {
        "h": 12,
        "w": 24,
        "x": 0,
        "y": 0
      },
      "id": 1,
      "options": {
        "minVizHeight": 75,
        "minVizWidth": 75,
        "orientation": "auto",
        "reduceOptions": {
          "values": false,
          "calcs": ["lastNotNull"],
          "fields": ""
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": false,
        "text": {
          "titleSize": 16,
          "valueSize": 40
        }
      },
      "pluginVersion": "10.2.3",
      "targets": [
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Total\" FROM chamados;",
          "refId": "A"
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Aberto\" FROM chamados WHERE status = 'ABERTO';",
          "refId": "B",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Em Atendimento\" FROM chamados WHERE status = 'EM_ATENDIMENTO';",
          "refId": "C",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Encerrado\" FROM chamados WHERE status = 'ENCERRADO';",
          "refId": "D",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Cancelado\" FROM chamados WHERE status = 'CANCELADO';",
          "refId": "E",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Reaberto\" FROM chamados WHERE status = 'REABERTO';",
          "refId": "F",
          "hide": false
        }
      ],
      "title": "CHAMADOS",
      "type": "gauge"
    },
    {
      "datasource": {
        "type": "postgres",
        "uid": "PCCC55553A094F547"
      },
      "description": "Linha temporal mostrando quantidade de chamados criados por dia nos últimos 30 dias",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisCenteredZero": false,
            "axisColorMode": "text",
            "axisLabel": "Quantidade de Chamados",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "line",
            "fillOpacity": 25,
            "gradientMode": "opacity",
            "hideFrom": {
              "tooltip": false,
              "viz": false,
              "legend": false
            },
            "lineInterpolation": "smooth",
            "lineWidth": 3,
            "pointSize": 8,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "always",
            "spanNulls": true,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              }
            ]
          },
          "unit": "short"
        },
        "overrides": []
      },
      "gridPos": {
        "h": 10,
        "w": 24,
        "x": 0,
        "y": 12
      },
      "id": 2,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom",
          "showLegend": false
        },
        "tooltip": {
          "mode": "single",
          "sort": "none"
        }
      },
      "pluginVersion": "10.2.3",
      "targets": [
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "time_series",
          "rawQuery": true,
          "rawSql": "SELECT \n  DATE_TRUNC('day', \"geradoEm\") as time,\n  COUNT(*) as value\nFROM chamados\nWHERE \"geradoEm\" >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY DATE_TRUNC('day', \"geradoEm\")\nORDER BY time ASC;",
          "refId": "A"
        }
      ],
      "title": "📈 CHAMADOS CRIADOS POR DIA (ÚLTIMOS 30 DIAS)",
      "type": "timeseries"
    },
    {
      "datasource": {
        "type": "postgres",
        "uid": "PCCC55553A094F547"
      },
      "description": "Distribuição de chamados por status - usando queries individuais",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "hideFrom": {
              "tooltip": false,
              "viz": false,
              "legend": false
            }
          },
          "mappings": []
        },
        "overrides": [
          {
            "matcher": {
              "id": "byName",
              "options": "Aberto"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "fixedColor": "blue",
                  "mode": "fixed"
                }
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Em Atendimento"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "fixedColor": "yellow",
                  "mode": "fixed"
                }
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Encerrado"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "fixedColor": "green",
                  "mode": "fixed"
                }
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Cancelado"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "fixedColor": "red",
                  "mode": "fixed"
                }
              }
            ]
          },
          {
            "matcher": {
              "id": "byName",
              "options": "Reaberto"
            },
            "properties": [
              {
                "id": "color",
                "value": {
                  "fixedColor": "purple",
                  "mode": "fixed"
                }
              }
            ]
          }
        ]
      },
      "gridPos": {
        "h": 10,
        "w": 24,
        "x": 0,
        "y": 22
      },
      "id": 3,
      "options": {
        "displayLabels": [],
        "legend": {
          "displayMode": "list",
          "placement": "bottom",
          "showLegend": false,
          "values": []
        },
        "pieType": "donut",
        "tooltip": {
          "mode": "single",
          "sort": "none"
        }
      },
      "pluginVersion": "10.2.3",
      "targets": [
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Aberto\" FROM chamados WHERE status = 'ABERTO';",
          "refId": "A"
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Em Atendimento\" FROM chamados WHERE status = 'EM_ATENDIMENTO';",
          "refId": "B",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Encerrado\" FROM chamados WHERE status = 'ENCERRADO';",
          "refId": "C",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Cancelado\" FROM chamados WHERE status = 'CANCELADO';",
          "refId": "D",
          "hide": false
        },
        {
          "datasource": {
            "type": "postgres",
            "uid": "PCCC55553A094F547"
          },
          "editorMode": "code",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT COUNT(*) as \"Reaberto\" FROM chamados WHERE status = 'REABERTO';",
          "refId": "E",
          "hide": false
        }
      ],
      "title": "DISTRIBUIÇÃO POR STATUS",
      "type": "piechart"
    }
  ],
  "refresh": "1m",
  "schemaVersion": 38,
  "style": "dark",
  "tags": [
    "helpdesk",
    "chamados",
    "service-desk"
  ],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-30d",
    "to": "now"
  },
  "timepicker": {
    "refresh_intervals": [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "2h",
      "1d"
    ]
  },
  "timezone": "America/Sao_Paulo",
  "title": "helpme-dashboard-chamados",
  "uid": "helpme-dashboard-v1",
  "version": 1,
  "weekStart": ""
}
EOF

# ============================================
# ARQUIVO: dashboards.yml (provisioning)
# ============================================
echo -e "${YELLOW}Criando configuração de dashboards...${NC}"
$SUDO cat > "${BASE_DIR}/grafana/provisioning/dashboards/dashboards.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'Helpme Dashboards'
    orgId: 1
    folder: 'Resumo de Chamados'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

# ============================================
# ARQUIVO: postgresql.yml
# ============================================
echo -e "${YELLOW}Criando datasource postgresql.yml...${NC}"
$SUDO cat > "${BASE_DIR}/grafana/provisioning/datasources/postgresql.yml" << 'EOF'
apiVersion: 1
datasources:
  - name: PostgreSQL Helpdesk
    type: postgres
    url: postgresql_helpme:5432
    database: helpme-database
    user: administrador
    secureJsonData:
      password: '1qaz2wsx3edc'
    jsonData:
      sslmode: 'disable'
    isDefault: true
EOF

# ============================================
# ESTRUTURA PROMETHEUS
# ============================================
echo -e "${YELLOW}Criando estrutura do Prometheus...${NC}"
$SUDO mkdir -p "${BASE_DIR}/prometheus"

# ============================================
# ARQUIVO: prometheus.yml
# ============================================
echo -e "${YELLOW}Criando prometheus.yml...${NC}"
$SUDO cat > "${BASE_DIR}/prometheus/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

# ============================================
# AJUSTAR PERMISSÕES
# ============================================
echo -e "${YELLOW}Ajustando permissões...${NC}"
$SUDO chmod -R 755 "${BASE_DIR}"
$SUDO chown -R $USER:$USER "${BASE_DIR}" 2>/dev/null || true

# ============================================
# VERIFICAR ARQUIVOS
# ============================================
echo -e "${YELLOW}Verificando arquivos criados...${NC}"
ERRORS=0

if [ ! -f "${BASE_DIR}/prometheus/prometheus.yml" ]; then
    echo -e "${RED}ERRO: prometheus.yml não foi criado como arquivo!${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "${BASE_DIR}/grafana/provisioning/datasources/postgresql.yml" ]; then
    echo -e "${RED}ERRO: postgresql.yml não foi criado como arquivo!${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "${BASE_DIR}/grafana/provisioning/dashboards/dashboards.yml" ]; then
    echo -e "${RED}ERRO: dashboards.yml não foi criado como arquivo!${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "${BASE_DIR}/grafana/dashboards/helpme-chamados.json" ]; then
    echo -e "${RED}ERRO: helpme-chamados.json não foi criado como arquivo!${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}Erros encontrados! Verifique os arquivos.${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi

# ============================================
# RESUMO
# ============================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Estrutura criada com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${BLUE}Estrutura criada:${NC}"
echo -e "  ${BASE_DIR}/"
echo -e "  ├── grafana/"
echo -e "  │   ├── dashboards/"
echo -e "  │   │   └── helpme-chamados.json"
echo -e "  │   └── provisioning/"
echo -e "  │       ├── dashboards/"
echo -e "  │       │   └── dashboards.yml"
echo -e "  │       └── datasources/"
echo -e "  │           └── postgresql.yml"
echo -e "  └── prometheus/"
echo -e "      └── prometheus.yml"
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}Todos os arquivos verificados e criados corretamente!${NC}"
echo -e "${GREEN}=====================================================${NC}"