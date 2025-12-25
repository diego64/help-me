import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ==== Métricas ====
const errorRate = new Rate('errors');
const chamadoCreationTime = new Trend('chamado_creation_time');
const authSuccessRate = new Rate('auth_success');
const requestCounter = new Counter('total_requests');

// ============================================
// Configuração do Teste
// ============================================
export const options = {
  scenarios: {
    spike_test_light: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 50,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '60s', target: 20 },
        { duration: '45s', target: 40 },
        { duration: '30s', target: 20 },
        { duration: '30s', target: 5 },
      ],
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    errors: ['rate<0.25'],
    'http_req_duration{scenario:auth}': ['p(95)<1500'],
    'http_req_duration{scenario:chamados}': ['p(95)<2500'],
  },
};

const BASE_URL = 'http://localhost:3000';

const ADMIN_CREDENTIALS = {
  email: 'admin@helpme.com',
  password: 'Admin123!',
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function randomString(length = 8) {
  return Math.random().toString(36).substring(2, length + 2);
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomCPF() {
  return String(randomNumber(10000000000, 99999999999));
}

function authLogin() {
  const url = `${BASE_URL}/auth/login`;
  const payload = JSON.stringify(ADMIN_CREDENTIALS);
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'auth', name: 'login' },
  };

  const res = http.post(url, payload, params);
  
  const success = check(res, {
    'login status ok': (r) => [200, 201].includes(r.status),
    'login has token': (r) => {
      try {
        const body = r.json();
        return body.accessToken !== undefined || body.token !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  authSuccessRate.add(success);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    const body = res.json();
    return body.accessToken || body.token || '';
  } catch (e) {
    return '';
  }
}

function authMe(token) {
  const url = `${BASE_URL}/auth/me`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { scenario: 'auth', name: 'me' },
  };

  const res = http.get(url, params);
  
  check(res, {
    'auth/me status ok': (r) => r.status === 200,
  });

  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function chamadoAbertura() {
  const url = `${BASE_URL}/chamado/abertura-chamado`;
  const payload = JSON.stringify({
    titulo: `Chamado ${randomString()}`,
    descricao: 'Descrição do problema',
    prioridade: String(randomNumber(1, 3)),
    servicoId: String(randomNumber(1, 10)),
  });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'chamados', name: 'abertura' },
  };

  const start = Date.now();
  const res = http.post(url, payload, params);
  chamadoCreationTime.add(Date.now() - start);

  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    return res.json('id');
  } catch (e) {
    return null;
  }
}

function chamadoUpdateStatus() {
  const chamadoId = randomNumber(1, 100);
  const url = `${BASE_URL}/chamado/${chamadoId}/status`;
  const payload = JSON.stringify({
    status: 'EM_ATENDIMENTO',
    observacao: 'Atualizando status',
  });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'chamados', name: 'update_status' },
  };

  const res = http.patch(url, payload, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function chamadoGetHistorico() {
  const chamadoId = randomNumber(1, 100);
  const url = `${BASE_URL}/chamado/${chamadoId}/historico`;
  const params = { tags: { scenario: 'chamados', name: 'get_historico' } };

  const res = http.get(url, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaMeusChamados() {
  const url = `${BASE_URL}/filadechamados/meus-chamados`;
  const params = { tags: { scenario: 'fila', name: 'meus_chamados' } };

  const res = http.get(url, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaChamadosAtribuidos() {
  const url = `${BASE_URL}/filadechamados/chamados-atribuidos`;
  const params = { tags: { scenario: 'fila', name: 'atribuidos' } };

  const res = http.get(url, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaTodosChamados() {
  const url = `${BASE_URL}/filadechamados/todos-chamados`;
  const params = { tags: { scenario: 'fila', name: 'todos' } };

  const res = http.get(url, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaChamadosAbertos() {
  const url = `${BASE_URL}/filadechamados/abertos`;
  const params = { tags: { scenario: 'fila', name: 'abertos' } };

  const res = http.get(url, params);
  errorRate.add(res.status !== 200);
  requestCounter.add(1);
}

function usuarioCreate() {
  const url = `${BASE_URL}/usuario/`;
  const payload = JSON.stringify({
    nome: `Usuario ${randomString()}`,
    sobrenome: `Teste ${randomString()}`,
    email: `user${randomNumber(1000, 9999)}@test.com`,
    senha: 'senha123',
    cpf: randomCPF(),
  });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'users', name: 'create' },
  };

  const res = http.post(url, payload, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    return res.json('id');
  } catch (e) {
    return null;
  }
}

function servicoGetById() {
  const servicoId = randomNumber(1, 20);
  const url = `${BASE_URL}/servico/${servicoId}`;
  const params = { tags: { scenario: 'services', name: 'get_by_id' } };

  const res = http.get(url, params);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

// ============================================
// Função Principal
// ============================================

export default function () {
  const scenarios = [
    // Auth (peso alto)
    { weight: 25, fn: () => { 
      const token = authLogin(); 
      sleep(0.5); 
      if (token) authMe(token); 
    }},
    
    // Chamados (peso alto)
    { weight: 15, fn: chamadoAbertura },
    { weight: 10, fn: chamadoUpdateStatus },
    { weight: 8, fn: chamadoGetHistorico },
    
    // Fila (peso alto)
    { weight: 12, fn: filaMeusChamados },
    { weight: 10, fn: filaChamadosAtribuidos },
    { weight: 8, fn: filaTodosChamados },
    { weight: 10, fn: filaChamadosAbertos },
    
    // Outros
    { weight: 2, fn: usuarioCreate },
    { weight: 2, fn: servicoGetById },
  ];

  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const random = Math.random() * totalWeight;
  let sum = 0;

  for (const scenario of scenarios) {
    sum += scenario.weight;
    if (random <= sum) {
      scenario.fn();
      break;
    }
  }

  sleep(Math.random() * 1.5 + 0.5);
}

// ============================================
// Setup e Teardown
// ============================================

export function setup() {
  console.log('');
  console.log('[INFO] Teste FINAL - 20 Conexões (404 = OK)');
  console.log('============================================');
  console.log('Configuração:');
  console.log('- DB max_connections: 20');
  console.log('- Throughput: ~40 req/s');
  console.log('- VUs máximo: 50');
  console.log('============================================');
  console.log('');
  
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(ADMIN_CREDENTIALS),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status === 200) {
    console.log('[SUCESSO] Setup: API acessível');
    const body = JSON.parse(loginRes.body);
    return { token: body.accessToken || body.token };
  } else {
    console.error('[ERROR] Setup: Falha ao conectar na API');
    return { token: null };
  }
}

export function teardown(data) {
  console.log('');
  console.log('============================================');
  console.log('[INFO] Teste finalizado');
  console.log('============================================');
  console.log('');
  console.log('Métricas esperadas:');
  console.log('[SUCESSO] errors (reais): < 25%');
  console.log('[SUCESSO] p95 latência: < 2s');
  console.log('[SUCESSO] Throughput: ~25-35 req/s');
  console.log('');
}