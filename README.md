# Help-Me API

### Sobre o Projeto

**Help-Me API** é uma plataforma centralizada para gerenciamento de chamados técnicos, desenvolvida para atender demandas de suporte de forma eficiente e estruturada.

A solução oferece três perfis de usuários com permissões específicas:
- **Usuários**: Abrem e acompanham chamados
- **Técnicos**: Recebem, gerenciam e resolvem atendimentos
- **Administradores**: Permissão total e visão completa via dashboards Grafana

---

## Funcionalidades

### Autenticação e Autorização
- [X] Sistema completo de autenticação JWT
- [X] Controle de acesso baseado em roles (ADMIN, TECNICO, USUARIO)
- [X] Refresh tokens para sessões prolongadas
- [X] Proteção de rotas por perfil de usuário

### Gestão de Usuários
- [X] CRUD completo de usuários
- [X] Gerenciamento de perfis e permissões
- [X] Hash de senhas com bcrypt

### Gestão de Chamados (Tickets)
- [X] Abertura, atualização e fechamento de chamados
- [X] Sistema de prioridades e status
- [X] Atribuição automática de técnicos
- [X] Histórico completo de alterações
- [X] Anexo de arquivos e comentários
- [X] Vinculação hierárquica entre chamados (pai / filho, níveis ilimitados)
- [X] Encerramento em cascata ao encerrar ou cancelar o chamado pai

### Gestão de SLA
- [X] Cálculo automático de `slaDeadline` na criação do chamado
- [X] Chamados críticos (P1 / P2) — prazo contínuo 24/7 (1h e 4h respectivamente)
- [X] Chamados comuns (P3 / P4 / P5) — prazo em horas úteis conforme expediente do técnico
- [X] Job cron a cada 5 min para marcar violações (`slaViolado`, `slaVioladoEm`)
- [X] Status de SLA em tempo real: `NO_PRAZO` | `VENCENDO` | `VENCIDO`
- [X] Eventos Kafka publicados em `sla.calculado` e `sla.violado`

### Gestão de Técnicos
- [X] Cadastro e gerenciamento de técnicos
- [X] Especialidades e áreas de atuação
- [X] Disponibilidade e carga de trabalho
- [X] Métricas de performance

### Gestão de Serviços
- [X] Catálogo de serviços disponíveis
- [X] Categorização e classificação
- [X] SLA por tipo de serviço
- [X] Templates de resolução

### Monitoramento
- [X] Monitoramento em tempo real da infraestrutura (servidores, containers, bancos)
- [X] Dashboards de desempenho operacional do suporte técnico
- [X] Métricas de SLA, carga de trabalho e status de atendimentos

---

## Estrutura do Projeto

```
.
├── .github
│   └── workflows
│       └── homologacao.yml          # Pipeline CI/CD de homologação
├── api
│   ├── k8s                          # Manifests Kubernetes
│   │   ├── application              # Deployment, HPA, PDB, ConfigMap, Secrets, Jobs
│   │   ├── databases                # PostgreSQL, MongoDB, Redis
│   │   ├── ingress                  # Nginx, cert-manager, rate-limit, network policies
│   │   ├── messaging                # Kafka + Zookeeper
│   │   ├── monitoring               # Prometheus, Grafana, InfluxDB, exporters
│   │   └── namespaces
│   ├── painel-analitico             # Dashboards e configurações de observabilidade
│   │   ├── grafana
│   │   │   ├── dashboards           # chamados, infraestrutura, logs-api
│   │   │   └── provisioning         # datasources (Loki, Prometheus, MongoDB, Redis, PostgreSQL)
│   │   └── monitoring               # loki-config, prometheus, promtail
│   ├── prisma                       # ORM e banco relacional
│   │   ├── migrations               # Migrações versionadas (inclui sla_e_hierarquia_chamados)
│   │   ├── optimizations            # Índices de performance
│   │   ├── schema.prisma
│   │   ├── seed.ts                  # Seed padrão
│   │   ├── seed-medium.ts           # Seed médio
│   │   └── seed-big.ts              # Seed com volume maior de dados (500 chamados)
│   ├── scripts                      # Scripts utilitários e diagnóstico
│   ├── src
│   │   ├── __tests__
│   │   │   ├── e2e                  # Testes end-to-end (auth, chamados, fila, admin, etc.)
│   │   │   ├── performance          # Testes k6 (carga, spike, stress, soak)
│   │   │   └── unit                 # Testes unitários por camada DDD
│   │   ├── application
│   │   │   └── use-cases
│   │   │       └── chamado          # chamado.service.ts
│   │   ├── domain
│   │   │   ├── sla
│   │   │   │   ├── sla.config.ts    # Prazos por prioridade
│   │   │   │   ├── sla.calculator.ts# Cálculo de deadline (24/7 e horas úteis)
│   │   │   │   ├── sla.validator.ts # Status em tempo real (NO_PRAZO / VENCENDO / VENCIDO)
│   │   │   │   └── sla.service.ts   # calcularEPersistirSLA()
│   │   │   └── chamado
│   │   │       ├── chamado.service.ts # vincularChamado(), encerrarCascata()
│   │   │       └── chamado.routes.ts  # POST /:id/vincular, DELETE, GET hierarquia
│   │   ├── infrastructure
│   │   │   ├── database             # Clientes PostgreSQL (Prisma), MongoDB e Redis
│   │   │   ├── email                # Serviço de e-mail
│   │   │   ├── http
│   │   │   │   └── middlewares      # Auth, rate-limit, loggers de request e erro
│   │   │   ├── jobs
│   │   │   │   ├── sla-checker.job.ts # Cron */5min — detecta e persiste violações de SLA
│   │   │   │   └── sla.job.ts         # Cron diário — resumo e relatórios de SLA
│   │   │   ├── messaging
│   │   │   │   └── kafka            # Consumers e producers
│   │   │   └── repositories         # Repositório de atualizações de chamados
│   │   ├── presentation
│   │   │   └── http
│   │   │       └── routes           # admin, auth, chamado, fila, servico, tecnico, usuario
│   │   ├── shared
│   │   │   ├── @types               # Extensões de tipos Express e domínio
│   │   │   ├── config               # JWT, logger (Pino), password, swagger
│   │   │   └── utils
│   │   ├── templates                # Templates Handlebars para e-mails
│   │   ├── app.ts
│   │   └── server.ts
│   ├── Dockerfile
│   ├── docker-compose.yaml
│   └── prisma.config.ts
```

---

## Instalação

### Pré-requisitos

- Node.js 18+ ou Bun
- Docker & Docker Compose
- pnpm (gerenciador de pacotes)

### Passo a Passo

```bash
# 1. Clone o repositório
git clone https://github.com/diego64/help-me
cd help-me/api

# 2. Instale as dependências
pnpm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 4. Suba a infraestrutura (PostgreSQL, MongoDB, Redis, Kafka, etc)
docker compose up -d

# 5. Execute as migrações do banco
pnpm run generate
pnpm run migrate

# 6. (Opcional) Popule com dados de exemplo
pnpm run seed

# 7. Inicie a aplicação
pnpm run dev
```

A API estará disponível em `http://localhost:3000`

---

## Documentação da API

### Swagger UI

Acesse a documentação interativa completa:
```
http://localhost:3000/api-docs
```

---

## SLA

### Prazos por Prioridade

| Prioridade | Prazo | Modo de contagem |
|------------|-------|-----------------|
| P1 | 1 hora | Contínuo 24/7 |
| P2 | 4 horas | Contínuo 24/7 |
| P3 | 8 horas úteis | Expediente do técnico |
| P4 | 24 horas úteis | Expediente do técnico |
| P5 | 72 horas úteis | Expediente do técnico |

Chamados **P1 e P2** não pausam fora do expediente — o relógio corre ininterruptamente.  
Chamados **P3, P4 e P5** descontam o tempo fora do expediente do técnico atribuído (padrão `08:00–18:00` quando nenhum técnico está designado).

### Status em Tempo Real

O campo `statusSLA` é calculado dinamicamente via `sla.validator` em cada resposta de `GET /chamados/:id`:

| Status | Significado |
|--------|-------------|
| `NO_PRAZO` | Dentro do prazo |
| `VENCENDO` | Menos de 30 minutos para vencer |
| `VENCIDO` | Prazo ultrapassado |

### Fluxo de Ponta a Ponta

```
POST /chamados
  └→ criarChamado()
       └→ sla.service.calcularEPersistir(chamadoId, prioridade, tecnicoId?)
            ├→ sla.calculator.calcularDeadline(now(), prioridade, expediente?)
            ├→ prisma.chamado.update({ slaDeadline })
            └→ kafka.publish("sla.calculado")

CRON */5 min
  └→ sla-checker.job
       └→ SELECT WHERE slaDeadline < now() AND slaViolado = false
            └→ UPDATE slaViolado=true, slaVioladoEm=now()
                 └→ kafka.publish("sla.violado")

GET /chamados/:id
  └→ response inclui { slaDeadline, slaViolado, statusSLA }
       └→ statusSLA calculado em tempo real via sla.validator
```

---

## Vinculação de Chamados

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/chamados/:id/vincular` | Vincula um chamado filho ao pai |
| `DELETE` | `/chamados/:id/vincular/:filhoId` | Remove vínculo |
| `GET` | `/chamados/:id/hierarquia` | Retorna a hierarquia completa |

### Regras de Negócio

- Hierarquia **ilimitada** — um filho pode ter filhos próprios
- Ao vincular, o chamado filho é **encerrado automaticamente** com `descricaoEncerramento = "Chamado vinculado ao chamado {OS_PAI}"`
- Quando o pai é encerrado ou cancelado, **todos os filhos diretos são encerrados em cascata**
- Chamados com **qualquer status** podem ser vinculados como filho (incluindo já encerrados/cancelados)
- Um chamado **não pode ser vinculado a si mesmo**
- Um chamado **não pode ser vinculado a um descendente seu** (previne ciclos)

---

## Schema — Campos Adicionados ao Model `Chamado`

```prisma
model Chamado {
  // ... campos existentes ...

  chamadoPaiId  String?   @map("chamado_pai_id")
  chamadoPai    Chamado?  @relation("hierarquia", fields: [chamadoPaiId], references: [id])
  chamadoFilhos Chamado[] @relation("hierarquia")

  vinculadoEm  DateTime? @map("vinculado_em")  @db.Timestamptz(3)
  vinculadoPor String?   @map("vinculado_por")

  slaDeadline   DateTime? @map("sla_deadline")   @db.Timestamptz(3)
  slaViolado    Boolean   @default(false)         @map("sla_violado")
  slaVioladoEm  DateTime? @map("sla_violado_em")  @db.Timestamptz(3)

  @@index([chamadoPaiId])
  @@index([slaDeadline])
  @@index([slaViolado])
  @@index([slaViolado, status])
}
```

### Migration

```bash
pnpm prisma migrate dev --name sla_e_hierarquia_chamados
```

| Campo | Tipo | Default | Nullable |
|-------|------|---------|----------|
| `chamado_pai_id` | uuid | — | sim |
| `vinculado_em` | timestamptz(3) | — | sim |
| `vinculado_por` | uuid | — | sim |
| `sla_deadline` | timestamptz(3) | — | sim |
| `sla_violado` | boolean | `false` | não |
| `sla_violado_em` | timestamptz(3) | — | sim |

> ⚠️ Migration não destrutiva — todos os novos campos são nullable ou possuem valor default. Nenhuma coluna existente foi removida.

---

## Testes

```bash
# Todos os testes
pnpm run test

# Testes unitários
pnpm run test:unit

# Testes E2E
pnpm run test:e2e

# Testes de integração
pnpm run test:integration

# Cobertura de testes
pnpm run test:coverage

# Testes unitários de SLA
pnpm test src/__tests__/unit/domain/sla/

# Testes E2E de vinculação e hierarquia
pnpm test src/__tests__/e2e/chamado.e2e.test.ts
```

### Testes de Performance (k6)

Os testes de carga estão em `src/__tests__/performance/` e cobrem os seguintes cenários:

| Cenário | Arquivo | Descrição |
|---------|---------|-----------|
| Carga | `carga/carga.js` | Simula uso normal da API |
| Stress | `stress/stress.js` | Eleva a carga progressivamente até o limite |
| Spike | `spike/spike.js` | Pico repentino de requisições |
| Soak | `soak/soak.js` | Carga sustentada por longo período |

Os resultados são exportados em CSV, JSON e HTML em `results/`.

---

## Seeds

| Comando | Arquivo | Descrição |
|---------|---------|-----------|
| `pnpm run seed` | `seed.ts` | Dados padrão |
| `pnpm run seed-medium` | `seed-medium.ts` | Volume médio com SLA e vínculos |
| `pnpm run seed-big` | `seed-big.ts` | 500 chamados com SLA completo |

Os seeds `seed-medium.ts` e `seed-big.ts` populam os campos `slaDeadline`, `slaViolado`, `slaVioladoEm`, `chamadoPaiId`, `vinculadoEm` e `vinculadoPor`.

```bash
# Popular com seed big e verificar violações (deve retornar 112)
pnpm run seed-big
psql $DATABASE_URL -c "SELECT COUNT(*) FROM chamados WHERE sla_violado = true;"

# Verificar hierarquia
psql $DATABASE_URL -c "SELECT os, chamado_pai_id FROM chamados WHERE chamado_pai_id IS NOT NULL LIMIT 10;"
```

---

## Monitoramento

### Dashboards Disponíveis

**Dashboard de Infraestrutura**
- Status de servidores e containers
- Métricas de CPU, memória e disco
- Saúde dos bancos de dados (PostgreSQL, MongoDB, Redis, Kafka)

**Dashboard de Suporte**
- Chamados abertos/fechados
- Tempo médio de resolução
- Taxa de cumprimento de SLA
- Performance por técnico

**Dashboard de Logs**
- Visualização de logs da API via Loki
- Rastreamento de requisições por request ID

### Acesso aos Painéis

```
Grafana:    http://localhost:3001
Prometheus: http://localhost:9090
InfluxDB:   http://localhost:8086
```

**Credenciais padrão**: `admin / admin` (altere em produção)

---

## Kubernetes

Os manifests para deploy em cluster Kubernetes estão em `api/k8s/` e cobrem:

- **Application**: Deployment, HPA, PDB, CronJob de backup, Job de seed, NetworkPolicy, PriorityClass, ResourceQuota
- **Databases**: PostgreSQL, MongoDB, Redis com PVCs e Secrets
- **Messaging**: Kafka + Zookeeper com PVCs e ConfigMaps
- **Ingress**: Nginx controller, cert-manager, rate limiting, autenticação básica
- **Monitoring**: Prometheus, Grafana, InfluxDB e exporters para todos os serviços

---

## Autor

**Diego Ferreira L.G. Oliveira** — Desenvolvimento e Arquitetura

- GitHub: [@diego64](https://github.com/diego64)
- LinkedIn: [Diego Ferreira](https://www.linkedin.com/in/diego-ferreira-a60a8a161/)
