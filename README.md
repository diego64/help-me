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
```

---

## Monitoramento

### Dashboards Disponíveis

**Dashboard de Infraestrutura**
- Status de servidores e containers
- Métricas de CPU, memória e disco
- Saúde dos bancos de dados

**Dashboard de Suporte**
- Chamados abertos/fechados
- Tempo médio de resolução
- Taxa de cumprimento de SLA
- Performance por técnico

### Acesso aos Painéis
```
Grafana:    http://localhost:3001
Prometheus: http://localhost:9090
InfluxDB:   http://localhost:8086
```

**Credenciais padrão**: `admin / admin` (altere em produção)

---

## Autor

**Diego Ferreira L.G. Oliveira** - Desenvolvimento e Arquitetura

- GitHub: [@diego64](https://github.com/diego64)
- LinkedIn: [Diego Ferreira]([https://linkedin.com/in/seu-perfil](https://www.linkedin.com/in/diego-ferreira-a60a8a161/))
