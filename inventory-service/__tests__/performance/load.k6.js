/**
 * Teste de carga — inventory-service
 *
 * Execução:
 *   k6 run __tests__/performance/load.k6.js \
 *     -e BASE_URL=http://localhost:3334 \
 *     -e TOKEN=<jwt>
 *
 * Variáveis de ambiente:
 *   BASE_URL  — base da API           (padrão: http://localhost:3334)
 *   TOKEN     — JWT com regra ADMIN   (obrigatório)
 *   VUS       — virtual users no pico (padrão: 50)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Configuração ─────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3334';
const TOKEN    = __ENV.TOKEN;
const VUS_PICO = parseInt(__ENV.VUS || '50');

if (!TOKEN) {
  throw new Error('TOKEN é obrigatório. Passe -e TOKEN=<jwt>');
}

const HEADERS = {
  Authorization:  `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Fixtures — dados reais do seed do banco
const NUMEROS_INV = [
  'INV0000012', 'INV0000009', 'INV0000063', 'INV0000055',
  'INV0000093', 'INV0000069', 'INV0000082', 'INV0000047',
  'INV0000071', 'INV0000089',
];

const SETORES = [
  'TECNOLOGIA_INFORMACAO',
  'RECURSOS_HUMANOS',
  'FINANCEIRO',
  'OPERACOES',
];

const NOMES_FILTRO = ['Notebook', 'Cadeira', 'Caneta', 'Monitor', 'Mouse'];

// ─── Métricas customizadas ─────────────────────────────────────────
const taxaErros      = new Rate('taxa_erros');
const duracaoEscrita = new Trend('duracao_escrita_ms', true);
const duracaoLeitura = new Trend('duracao_leitura_ms', true);

// ─── Stages ───────────────────────────────────────────────────────
// Thresholds separados por ambiente:
//   dev  — tsx sem build, WSL2: latências mais altas são esperadas
//   prod — Node compilado + infraestrutura dedicada
const isDev = (__ENV.ENV || 'dev') !== 'prod';

export const options = {
  stages: [
    { duration: '20s', target: Math.floor(VUS_PICO * 0.2) }, // ramp up suave
    { duration: '30s', target: Math.floor(VUS_PICO * 0.6) }, // carga moderada
    { duration: '40s', target: VUS_PICO },                    // pico
    { duration: '20s', target: 0 },                           // ramp down
  ],
  thresholds: {
    // latência geral (dev: 700ms/1.5s | prod: 500ms/1s)
    http_req_duration:    isDev ? ['p(95)<700', 'p(99)<1500'] : ['p(95)<500', 'p(99)<1000'],
    // taxa de falha HTTP
    http_req_failed:      ['rate<0.01'],
    // erros de negócio (checks falhados)
    taxa_erros:           ['rate<0.02'],
    // leitura (dev: 500ms | prod: 300ms)
    duracao_leitura_ms:   isDev ? ['p(95)<500'] : ['p(95)<300'],
    // escrita pode ser mais lenta (dev: 1s | prod: 700ms)
    duracao_escrita_ms:   isDev ? ['p(95)<1000'] : ['p(95)<700'],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function registrar(ok) {
  taxaErros.add(!ok);
}

// ─── Cenário 1: Leitura (70% do tráfego) ──────────────────────────
function cenarioLeitura() {
  group('health', () => {
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/health`);
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, { 'health → 200': res => res.status === 200 }));
  });

  group('GET /v1/inventario — lista paginada', () => {
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario?limite=20`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, {
      'lista → 200':  res => res.status === 200,
      'retorna array': res => Array.isArray(JSON.parse(res.body)),
    }));
  });

  group('GET /v1/inventario — filtro por nome', () => {
    const nome = rand(NOMES_FILTRO);
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario?nome=${nome}&limite=10`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, { 'filtro nome → 200': res => res.status === 200 }));
  });

  group('GET /v1/inventario — estoque critico', () => {
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario?estoqueCritico=true`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, { 'estoque crítico → 200': res => res.status === 200 }));
  });

  group('GET /v1/inventario/numero/:numero', () => {
    const numero = rand(NUMEROS_INV);
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario/numero/${numero}`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, {
      'busca por número → 200': res => res.status === 200,
      'tem campo item':         res => JSON.parse(res.body).item !== undefined,
    }));
  });

  group('GET /v1/inventario/numero/:numero/localizar', () => {
    const numero = rand(NUMEROS_INV);
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario/numero/${numero}/localizar`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, { 'localizar → 200': res => res.status === 200 }));
  });

  group('GET /v1/inventario/setor/:setor', () => {
    const setor = rand(SETORES);
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/inventario/setor/${setor}`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, { 'estoque setor → 200': res => res.status === 200 }));
  });

  group('GET /v1/categorias', () => {
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/categorias`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, {
      'categorias → 200':  res => res.status === 200,
      'retorna array':      res => Array.isArray(JSON.parse(res.body)),
    }));
  });

  group('GET /v1/fornecedores', () => {
    const t0 = Date.now();
    const r = http.get(`${BASE_URL}/v1/fornecedores?limite=20`, { headers: HEADERS });
    duracaoLeitura.add(Date.now() - t0);
    registrar(check(r, {
      'fornecedores → 200': res => res.status === 200,
      'retorna array':       res => Array.isArray(JSON.parse(res.body)),
    }));
  });
}

// ─── Cenário 2: Escrita — inventário e categorias (20% do tráfego) ─
function cenarioEscrita() {
  // 2a. Criar categoria com nome único
  group('POST /v1/categorias', () => {
    const t0 = Date.now();
    const r = http.post(
      `${BASE_URL}/v1/categorias`,
      JSON.stringify({ nome: `k6-${uid()}`, descricao: 'Criada pelo k6' }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);
    registrar(check(r, {
      'criar categoria → 201': res => res.status === 201,
      'tem id':                res => JSON.parse(res.body).id !== undefined,
    }));
  });

  // 2b. Buscar item pelo número e atualizar descrição
  group('PATCH /v1/inventario/:id', () => {
    const numero = rand(NUMEROS_INV);
    const busca = http.get(`${BASE_URL}/v1/inventario/numero/${numero}`, { headers: HEADERS });
    if (busca.status !== 200) return;

    const itemId = JSON.parse(busca.body).item.id;
    const t0 = Date.now();
    const r = http.patch(
      `${BASE_URL}/v1/inventario/${itemId}`,
      JSON.stringify({ descricao: `k6 update ${uid()}` }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);
    registrar(check(r, {
      'patch item → 200': res => res.status === 200,
      'nome preservado':  res => JSON.parse(res.body).nome !== undefined,
    }));
  });

  // 2c. Cadastrar fornecedor
  group('POST /v1/fornecedores', () => {
    const t0 = Date.now();
    const r = http.post(
      `${BASE_URL}/v1/fornecedores`,
      JSON.stringify({ nome: `Fornecedor k6-${uid()}` }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);
    registrar(check(r, {
      'criar fornecedor → 201': res => res.status === 201,
      'tem id':                  res => JSON.parse(res.body).id !== undefined,
    }));
  });

  // 2d. Destinar item para setor
  group('POST /v1/inventario/destinar', () => {
    const numero = rand(NUMEROS_INV);
    const t0 = Date.now();
    const r = http.post(
      `${BASE_URL}/v1/inventario/destinar`,
      JSON.stringify({
        numeroInventario: numero,
        setor:            rand(SETORES),
        quantidade:       1,
        observacoes:      `k6 destinação ${uid()}`,
      }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);
    // 422 é aceitável quando estoque está zerado para aquele item
    registrar(check(r, {
      'destinar → 200 ou 422': res => res.status === 200 || res.status === 422,
    }));
  });
}

// ─── Cenário 3: Fluxo completo de reembolso (10% do tráfego) ──────
function cenarioReembolso() {
  group('Fluxo reembolso: criar → aprovar → pagar', () => {
    // 1. Criar reembolso avulso
    const t0 = Date.now();
    const criar = http.post(
      `${BASE_URL}/v1/reembolsos`,
      JSON.stringify({
        valor:    parseFloat((Math.random() * 500 + 10).toFixed(2)),
        descricao: `Reembolso k6 ${uid()}`,
      }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);

    const criado = check(criar, {
      'criar reembolso → 201': r => r.status === 201,
      'status PENDENTE':       r => JSON.parse(r.body).status === 'PENDENTE',
    });
    registrar(criado);
    if (!criado) return;

    const id = JSON.parse(criar.body).id;
    sleep(0.05);

    // 2. Aprovar
    const aprovar = http.post(
      `${BASE_URL}/v1/reembolsos/${id}/aprovar`,
      null,
      { headers: HEADERS },
    );
    const aprovado = check(aprovar, {
      'aprovar reembolso → 200': r => r.status === 200,
      'status APROVADO':         r => JSON.parse(r.body).status === 'APROVADO',
    });
    registrar(aprovado);
    if (!aprovado) return;

    sleep(0.05);

    // 3. Processar pagamento
    const processar = http.post(
      `${BASE_URL}/v1/reembolsos/${id}/processar`,
      null,
      { headers: HEADERS },
    );
    registrar(check(processar, {
      'processar reembolso → 200': r => r.status === 200,
      'status PAGO':               r => JSON.parse(r.body).status === 'PAGO',
    }));
  });
}

// ─── Cenário 4: Fluxo completo de compra (8% do tráfego) ──────────
function cenarioCompra() {
  group('Fluxo compra: criar → aprovar → executar', () => {
    // 1. Criar solicitação
    const t0 = Date.now();
    const criar = http.post(
      `${BASE_URL}/v1/compras`,
      JSON.stringify({
        justificativa: `Compra k6 ${uid()}`,
        itens: [{ nomeProduto: rand(NOMES_FILTRO), quantidade: 1, precoEstimado: parseFloat((Math.random() * 200 + 50).toFixed(2)) }],
      }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);

    const criado = check(criar, {
      'criar compra → 201': r => r.status === 201,
      'status PENDENTE':    r => JSON.parse(r.body).status === 'PENDENTE',
    });
    registrar(criado);
    if (!criado) return;

    const id = JSON.parse(criar.body).id;
    sleep(0.05);

    // 2. Aprovar
    const aprovar = http.post(
      `${BASE_URL}/v1/compras/${id}/aprovar`,
      JSON.stringify({ formaPagamento: 'PIX', parcelas: 0 }),
      { headers: HEADERS },
    );
    const aprovado = check(aprovar, {
      'aprovar compra → 200': r => r.status === 200,
      'status APROVADO':      r => JSON.parse(r.body).status === 'APROVADO',
    });
    registrar(aprovado);
    if (!aprovado) return;

    sleep(0.05);

    // 3. Executar (registra entrada no estoque)
    const t1 = Date.now();
    const executar = http.post(
      `${BASE_URL}/v1/compras/${id}/executar`,
      JSON.stringify({ valorTotal: parseFloat((Math.random() * 200 + 50).toFixed(2)) }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t1);
    registrar(check(executar, {
      'executar compra → 200': r => r.status === 200,
      'status COMPRADO':       r => JSON.parse(r.body).status === 'COMPRADO',
    }));
  });
}

// ─── Cenário 5: Fluxo completo de baixa (7% do tráfego) ───────────
function cenarioBaixa() {
  group('Fluxo baixa: criar → aprovar-tecnico → aprovar-gestor → executar', () => {
    // 1. Criar solicitação de baixa
    const t0 = Date.now();
    const criar = http.post(
      `${BASE_URL}/v1/baixas`,
      JSON.stringify({
        justificativa: `Baixa k6 ${uid()}`,
        itens: [{ numeroInventario: rand(NUMEROS_INV), quantidade: 1 }],
      }),
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t0);

    const criado = check(criar, {
      'criar baixa → 201': r => r.status === 201,
      'status PENDENTE':   r => JSON.parse(r.body).status === 'PENDENTE',
    });
    registrar(criado);
    // 422 = estoque zerado para o item sorteado — não conta como falha de infra
    if (!criado) return;

    const id = JSON.parse(criar.body).id;
    sleep(0.05);

    // 2. Aprovação técnica
    const tecnico = http.post(
      `${BASE_URL}/v1/baixas/${id}/aprovar-tecnico`,
      null,
      { headers: HEADERS },
    );
    const aprovadoTecnico = check(tecnico, {
      'aprovar-tecnico → 200':    r => r.status === 200,
      'status APROVADO_TECNICO':  r => JSON.parse(r.body).status === 'APROVADO_TECNICO',
    });
    registrar(aprovadoTecnico);
    if (!aprovadoTecnico) return;

    sleep(0.05);

    // 3. Aprovação do gestor
    const gestor = http.post(
      `${BASE_URL}/v1/baixas/${id}/aprovar-gestor`,
      null,
      { headers: HEADERS },
    );
    const aprovadoGestor = check(gestor, {
      'aprovar-gestor → 200':    r => r.status === 200,
      'status APROVADO_GESTOR':  r => JSON.parse(r.body).status === 'APROVADO_GESTOR',
    });
    registrar(aprovadoGestor);
    if (!aprovadoGestor) return;

    sleep(0.05);

    // 4. Executar (registra saída do estoque)
    const t1 = Date.now();
    const executar = http.post(
      `${BASE_URL}/v1/baixas/${id}/executar`,
      null,
      { headers: HEADERS },
    );
    duracaoEscrita.add(Date.now() - t1);
    registrar(check(executar, {
      'executar baixa → 200': r => r.status === 200,
      'status CONCLUIDO':     r => JSON.parse(r.body).status === 'CONCLUIDO',
    }));
  });
}

// ─── Função principal ──────────────────────────────────────────────
export default function () {
  const sorteio = Math.random();

  if (sorteio < 0.60) {
    cenarioLeitura();
    sleep(Math.random() * 0.5 + 0.2);  // 200–700ms think time
  } else if (sorteio < 0.75) {
    cenarioEscrita();
    sleep(Math.random() * 0.8 + 0.5);  // 500ms–1.3s think time
  } else if (sorteio < 0.85) {
    cenarioReembolso();
    sleep(Math.random() * 0.5 + 0.3);  // 300–800ms think time
  } else if (sorteio < 0.93) {
    cenarioCompra();
    sleep(Math.random() * 0.6 + 0.4);  // 400ms–1s think time
  } else {
    cenarioBaixa();
    sleep(Math.random() * 0.6 + 0.4);  // 400ms–1s think time
  }
}
