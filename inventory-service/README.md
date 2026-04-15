<div align="center">
  <h1>inventory-service</h1>
  <p>Microsserviço de gerenciamento de inventário do Help-Me — controle de itens, estoque, solicitações de compra e reembolsos.</p>

  <p>
    <a href="#pré-requisitos">Pré-requisitos</a> •
    <a href="#variáveis-de-ambiente">Variáveis de ambiente</a> •
    <a href="#subindo-a-infraestrutura">Infraestrutura</a> •
    <a href="#banco-de-dados">Banco de dados</a> •
    <a href="#executando-o-serviço">Executando</a> •
    <a href="#testes">Testes</a> •
    <a href="#elk-stack">ELK Stack</a>
  </p>
</div>

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|------------|---------------|
| Node.js    | 20.x          |
| pnpm       | 8.x           |
| Docker     | 24.x          |
| Docker Compose | v2       |

> A rede externa `helpme-network` deve existir antes de subir qualquer serviço.  
> Crie uma única vez com: `docker network create helpme-network`

---

## Variáveis de ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

As variáveis obrigatórias são validadas no startup via **zod** — o processo falha imediatamente se alguma estiver ausente.

---

## Subindo a infraestrutura

O `docker-compose.yaml` sobe o PostgreSQL e o Redis do serviço:

```bash
# Subir PostgreSQL + Redis
docker compose up -d

# Subir somente o banco
docker compose up inventory-postgres -d

# Verificar status e health checks
docker compose ps

# Derrubar e remover volumes
docker compose down -v
```

### Infraestrutura de testes (E2E)

Bancos isolados em memória para os testes E2E, sem persistência:

```bash
# Subir banco e cache de testes
docker compose up inventory-postgres-test inventory-redis-test -d
```

| Container               | Porta local |
|-------------------------|-------------|
| `inventory-postgres`    | `${DB_PORT}` |
| `inventory-redis`       | `${REDIS_PORT}` |
| `inventory-postgres-test` | `5490`    |
| `inventory-redis-test`  | `6392`      |

---

## Banco de dados

Todas as operações de banco usam o **Prisma** e exigem o `.env` carregado.

```bash
# Criar/aplicar migrations em desenvolvimento
pnpm migrate

# Resetar banco e reaplicar todas as migrations (destrói dados)
pnpm migrate:reset

# Aplicar migrations sem interação (CI / produção)
pnpm run migrate:deploy

# Gerar o Prisma Client após alterar o schema
pnpm generate

# Popular o banco com dados iniciais
pnpm seed

# Abrir o Prisma Studio (UI visual do banco)
pnpm studio
```

> **Atenção:** nunca execute `migrate:reset` em produção. Use `migrate:deploy` em ambientes não-dev.

---

## Executando o serviço

```bash
# Instalar dependências
pnpm install

# Desenvolvimento (hot reload)
pnpm dev

# Build de produção
pnpm build

# Iniciar build de produção
pnpm start
```

O serviço sobe na porta definida em `PORT` no `.env`.

---

## Testes

```bash
# Todos os testes unitários (uma execução)
pnpm test

# Unitários em modo watch
pnpm test:watch

# Testes E2E (requer docker compose up inventory-postgres-test inventory-redis-test -d)
pnpm test:e2e

# Cobertura de código
pnpm test:coverage

# Teste de carga com k6
pnpm test:carga
```

> Os testes unitários rodam sem banco ou serviços externos — todos os ports são mockados.

---

## ELK Stack

O stack ELK do inventory-service fica em `elk/` e utiliza portas alternativas para não conflitar com o auth-service.

### Subindo o ELK

```bash
# Subir todos os containers ELK
docker compose -f elk/docker-compose.elk.yml --env-file .env up -d

# Acompanhar logs do setup (importação de dashboards)
docker logs -f elk-inventory-service-setup

# Derrubar o ELK (mantém volumes)
docker compose -f elk/docker-compose.elk.yml down

# Derrubar e apagar todos os dados
docker compose -f elk/docker-compose.elk.yml down -v
```

> O container `elk-inventory-service-setup` roda uma única vez na inicialização e importa os dashboards automaticamente no Kibana. Aguarde ele finalizar antes de acessar os painéis.

### Portas e interfaces

| Serviço       | Container                        | URL local                         |
|---------------|----------------------------------|-----------------------------------|
| Kibana        | `elk-inventory-service`          | http://localhost:5602             |
| Elasticsearch | `elk-inventory-service-es`       | http://localhost:9201             |
| Logstash beats | `elk-inventory-service-logstash` | `localhost:5045`                 |

### Pipelines Logstash

| Arquivo            | Fonte                              | Índice Elasticsearch          |
|--------------------|------------------------------------|-------------------------------|
| `01-logs.conf`     | Filebeat → logs da aplicação (pino JSON) | `inventory-logs-*`      |
| `02-financeiro.conf` | JDBC polling em `solicitacoes_compra` e `reembolsos` | `inventory-compras-*`, `inventory-reembolsos-*` |
| `03-inventario.conf` | JDBC polling em `itens_inventario` e `movimentacoes_estoque` | `inventory-itens-*`, `inventory-movimentacoes-*` |

### Dashboards Kibana

Os três dashboards são importados automaticamente na primeira inicialização:

| Dashboard                    | O que monitora                                                        |
|------------------------------|-----------------------------------------------------------------------|
| **Monitoramento de Logs**    | Volume/hora, níveis de log, erros, status HTTP, latência p50/p95/p99 |
| **Financeiro — Caixa**       | Total compras vs reembolsos, timeline, formas de pagamento, top fornecedores |
| **Controle de Inventário**   | Itens por categoria, estoque crítico, entradas vs saídas, motivos de movimentação |

### Rede compartilhada

O ELK acessa o PostgreSQL do serviço via a rede `inventory-service_inventory-network`, criada automaticamente pelo `docker-compose.yaml` principal. **Suba a infraestrutura principal antes do ELK.**

```bash
# Ordem correta de inicialização
docker compose up -d                                                      # 1. infraestrutura principal
docker compose -f elk/docker-compose.elk.yml --env-file .env up -d       # 2. ELK stack
```

### Verificando a saúde do Elasticsearch

```bash
curl http://localhost:9201/_cluster/health?pretty
```

---

## Arquitetura

```
src/
├── domain/          # Entidades e regras de negócio (sem dependências externas)
├── application/     # Use cases — um por operação
├── infrastructure/  # Implementações: banco, cache, mensageria, storage
│   ├── database/
│   ├── http/
│   ├── messaging/
│   ├── repositories/
│   └── storage/
└── presentation/    # Rotas HTTP e controllers
```

O serviço segue Clean Architecture — o domínio não importa nada de frameworks ou infraestrutura. Use cases são testados com mocks dos ports, sem subir servidor ou banco.

---

## Tecnologias principais

| Categoria       | Biblioteca                    |
|-----------------|-------------------------------|
| HTTP            | Express 5                     |
| ORM             | Prisma + `@prisma/adapter-pg` |
| Banco de dados  | PostgreSQL 17                 |
| Cache           | Redis 8 + `redis`             |
| Mensageria      | Kafka via `kafkajs`           |
| Testes          | Vitest                        |
| Logs            | Pino + pino-http              |
| Observabilidade | OpenTelemetry                 |
| Segurança       | Helmet + express-rate-limit   |
| Storage         | MinIO                         |
