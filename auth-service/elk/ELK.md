# ELK Stack — auth-service

Stack de observabilidade para ingestão e visualização dos logs JSON do auth-service (Pino).

## Componentes

| Container | Imagem | Porta | Função |
|---|---|---|---|
| `auth-elasticsearch` | elasticsearch:8.17.4 | 9200 | Armazena e indexa os logs |
| `auth-kibana` | kibana:8.17.4 | 5601 | Interface de visualização |
| `auth-filebeat` | filebeat:8.17.4 | — | Lê arquivos de log e envia ao ES |

---

## Pré-requisitos

- Docker + Docker Compose v2
- auth-service com `LOG_FILE=./logs/auth-service.log` no `.env`
- O diretório `auth-service/logs/` existir (criado automaticamente pelo Pino na primeira execução)

---

## Passo a passo

### 1. Configure o .env da ELK

```bash
cp elk/.env.elk.example elk/.env
# edite se necessário (portas, etc.)
```

Variáveis relevantes:

```env
ELASTICSEARCH_PORT=9200
KIBANA_PORT=5601
KIBANA_ENCRYPTION_KEY=auth-service-elk-key-32-chars-ok
LOG_FILE_DIR=../logs   # relativo ao diretório elk/
NODE_ENV=development
```

> `LOG_FILE_DIR` deve apontar para o mesmo diretório que `LOG_FILE` no `.env` do auth-service.
> Exemplo: se `LOG_FILE=./logs/auth-service.log`, então `LOG_FILE_DIR=../logs`.

### 2. Garanta que o auth-service está gravando logs em arquivo

No `.env` do auth-service:

```env
LOG_FILE=./logs/auth-service.log
```

Suba o auth-service e confirme que `auth-service/logs/auth-service.log` existe.

### 3. Suba a stack ELK

```bash
cd auth-service/elk
docker compose -f docker-compose.elk.yml --env-file .env up -d
```

Aguarde os containers ficarem healthy (pode levar ~2 min na primeira vez):

```bash
docker compose -f docker-compose.elk.yml ps
```

### 4. Execute o setup (apenas na primeira vez)

```bash
bash elk/setup.sh
```

O script:
1. Aguarda o Elasticsearch ficar disponível
2. Aplica o template de índice customizado (`priority: 200`), sobrescrevendo o template genérico do Filebeat
3. Aguarda o Kibana ficar operacional
4. Importa o data view `auth-service-logs-*` no Kibana

### 5. Acesse o Kibana

Abra http://localhost:5601 → **Discover** → selecione o data view `auth-service-logs-*`.

---

## Arquitetura do fluxo

```
auth-service (Pino JSON)
       │
       ▼ grava em ./logs/auth-service.log
       │
  [volume compartilhado]
       │
       ▼
  Filebeat (lê /logs/*.log)
       │ parseia JSON, mapeia time → @timestamp
       ▼
  Elasticsearch (índice auth-service-logs-YYYY.MM.DD)
       │
       ▼
  Kibana (Discover / Dashboards)
```

---

## Campos indexados

| Campo | Tipo | Origem |
|---|---|---|
| `@timestamp` | date | mapeado de `time` (Pino) |
| `level` | keyword | nível do log (info, warn, error) |
| `msg` | text + keyword | mensagem do log |
| `service` | keyword | sempre `auth-service` |
| `environment` | keyword | NODE_ENV |
| `requestId` | keyword | ID da requisição |
| `userId` | keyword | ID do usuário autenticado |
| `ip` | keyword | IP do cliente |
| `method` | keyword | método HTTP |
| `path` | keyword | path da rota |
| `statusCode` | integer | HTTP status |
| `duration` | float | latência em ms |
| `error.name` | keyword | tipo do erro |
| `error.message` | text | mensagem do erro |

---

## Comandos úteis

```bash
# Subir a stack
docker compose -f elk/docker-compose.elk.yml --env-file elk/.env up -d

# Ver logs dos containers
docker compose -f elk/docker-compose.elk.yml logs -f filebeat
docker compose -f elk/docker-compose.elk.yml logs -f elasticsearch

# Parar a stack (mantém dados nos volumes)
docker compose -f elk/docker-compose.elk.yml down

# Destruir tudo (apaga dados)
docker compose -f elk/docker-compose.elk.yml down -v

# Reaplicar template (após mudanças no index-template.json)
bash elk/setup.sh

# Verificar índices no ES
curl http://localhost:9200/_cat/indices/auth-service-logs-*?v

# Verificar template
curl http://localhost:9200/_index_template/auth-service-logs
```

---

## Problemas comuns

### Filebeat não ingere logs

- Confirme que `LOG_FILE_DIR` no `elk/.env` aponta para o diretório correto
- Confirme que o arquivo de log existe: `ls auth-service/logs/`
- Verifique os logs do Filebeat: `docker logs auth-filebeat`

### Kibana não abre / demora muito

- Kibana 8.x demora ~2 min na primeira vez; aguarde o healthcheck ficar `healthy`
- Verifique: `docker compose -f elk/docker-compose.elk.yml ps`

### Data view não aparece no Kibana

- Rode novamente o `bash elk/setup.sh` após o Kibana estar `healthy`
- Ou crie manualmente: Kibana → Stack Management → Data Views → Create

### Nenhum dado aparece no Discover

- Ajuste o intervalo de tempo (canto superior direito) para "Last 24 hours"
- Verifique se o Filebeat está rodando: `docker ps | grep filebeat`
- Confira se há registros no ES: `curl http://localhost:9200/auth-service-logs-*/_count`
