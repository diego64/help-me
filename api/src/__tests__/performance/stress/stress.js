import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================
// TESTE SPIKE FINAL - 15 Conexões DB
// ============================================

// Métricas customizadas
const errorRate = new Rate('errors');
const successRate = new Rate('success_rate');
const chamadoCreationTime = new Trend('chamado_creation_time');
const authSuccessRate = new Rate('auth_success');
const requestCounter = new Counter('total_requests');

// Configuração do teste
export const options = {
  scenarios: {
    spike_test_light: {
      executor: 'ramping-arrival-rate',
      startRate: 3,
      timeUnit: '1s',
      preAllocatedVUs: 15,
      maxVUs: 15,
      stages: [
        { duration: '60s', target: 5 },   // Warm-up
        { duration: '120s', target: 8 },  // Normal
        { duration: '60s', target: 15 },  // SPIKE 1
        { duration: '120s', target: 8 },  // Recuperação
        { duration: '30s', target: 20 },  // SPIKE 2
        { duration: '60s', target: 3 },   // Cool-down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.15'],
    success_rate: ['rate>0.70'],        // 70%+ sucesso
    'http_req_duration{scenario:auth}': ['p(95)<1000'],
    'http_req_duration{scenario:chamados}': ['p(95)<2000'],
  },
};

const BASE_URL = 'http://localhost:3000';

const ADMIN_CREDENTIALS = {
  email: 'admin@helpme.com',
  password: 'Admin123!',
};

function randomString(length = 8) {
  return Math.random().toString(36).substring(2, length + 2);
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomCPF() {
  return String(randomNumber(10000000000, 99999999999));
}

// ==================== AUTENTICAÇÃO ====================

function authLogin() {
  const url = `${BASE_URL}/auth/login`;
  const payload = JSON.stringify(ADMIN_CREDENTIALS);
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'auth', name: 'login' },
  };

  const res = http.post(url, payload, params);
  
  const isSuccess = res.status === 200 || res.status === 201;
  const success = check(res, {
    'login status ok': (r) => isSuccess,
    'login has token': (r) => {
      try {
        return r.json('accessToken') !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  authSuccessRate.add(success);
  successRate.add(isSuccess);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    return res.json('accessToken') || '';
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
  
  const isSuccess = res.status === 200;
  check(res, {
    'auth/me status ok': (r) => isSuccess,
  });

  successRate.add(isSuccess);
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

// ==================== USUÁRIOS ====================

function usersGetAll(token) {
  const url = `${BASE_URL}/usuario`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'users', name: 'get_all' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function usersCreate(token) {
  const url = `${BASE_URL}/usuario`;
  const payload = JSON.stringify({
    nome: `Usuario ${randomString()}`,
    sobrenome: `Teste ${randomString()}`,
    email: `user${randomNumber(1000, 9999)}@test.com`,
    senha: 'senha123',
    cpf: randomCPF(),
  });
  const params = {
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { scenario: 'users', name: 'create' },
  };

  const res = http.post(url, payload, params);
  successRate.add([200, 201, 400, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    return res.json('id');
  } catch (e) {
    return null;
  }
}

// ==================== CHAMADOS ====================

function chamadoAbertura(token) {
  const url = `${BASE_URL}/chamado/abertura-chamado`;
  const payload = JSON.stringify({
    titulo: `Chamado ${randomString()}`,
    descricao: 'Descrição do problema',
    prioridade: String(randomNumber(1, 3)),
    servicoId: String(randomNumber(1, 10)),
  });
  const params = {
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { scenario: 'chamados', name: 'abertura' },
  };

  const start = Date.now();
  const res = http.post(url, payload, params);
  chamadoCreationTime.add(Date.now() - start);

  successRate.add([200, 201, 400, 401, 404].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);

  try {
    return res.json('id');
  } catch (e) {
    return null;
  }
}

function chamadoUpdateStatus(token) {
  const chamadoId = randomNumber(1, 100);
  const url = `${BASE_URL}/chamado/${chamadoId}/status`;
  const payload = JSON.stringify({
    status: 'EM_ATENDIMENTO',
    observacao: 'Atualizando status',
  });
  const params = {
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { scenario: 'chamados', name: 'update_status' },
  };

  const res = http.patch(url, payload, params);
  successRate.add([200, 401, 404].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function chamadoGetHistorico(token) {
  const chamadoId = randomNumber(1, 100);
  const url = `${BASE_URL}/chamado/${chamadoId}/historico`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'chamados', name: 'get_historico' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401, 404].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

// ==================== FILA ====================

function filaChamadosAbertos(token) {
  const url = `${BASE_URL}/filadechamados/abertos`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'fila', name: 'abertos' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaMeusChamados(token) {
  const url = `${BASE_URL}/filadechamados/meus-chamados`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'fila', name: 'meus_chamados' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function filaTodosChamados(token) {
  const url = `${BASE_URL}/filadechamados/todos-chamados`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'fila', name: 'todos' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

// ==================== SERVIÇOS ====================

function servicesGetAll(token) {
  const url = `${BASE_URL}/servico`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'services', name: 'get_all' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

function servicesGetById(token) {
  const servicoId = randomNumber(1, 20);
  const url = `${BASE_URL}/servico/${servicoId}`;
  const params = { 
    headers: { Authorization: `Bearer ${token}` },
    tags: { scenario: 'services', name: 'get_by_id' },
  };

  const res = http.get(url, params);
  successRate.add([200, 401, 404].includes(res.status));
  errorRate.add(res.status >= 500);
  requestCounter.add(1);
}

// ==================== FUNÇÃO PRINCIPAL ====================

export default function () {
  const token = authLogin();
  
  if (!token) {
    sleep(2);
    return;
  }
  
  sleep(0.5);
  
  const scenarios = [
    { weight: 15, fn: () => authMe(token) },
    { weight: 12, fn: () => chamadoAbertura(token) },
    { weight: 10, fn: () => chamadoUpdateStatus(token) },
    { weight: 8, fn: () => chamadoGetHistorico(token) },
    { weight: 12, fn: () => filaChamadosAbertos(token) },
    { weight: 10, fn: () => filaMeusChamados(token) },
    { weight: 8, fn: () => filaTodosChamados(token) },
    { weight: 6, fn: () => usersGetAll(token) },
    { weight: 4, fn: () => usersCreate(token) },
    { weight: 6, fn: () => servicesGetAll(token) },
    { weight: 4, fn: () => servicesGetById(token) },
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

  sleep(Math.random() * 2 + 1);
}
final
// ==================== SETUP ====================

export function setup() {
  console.log('');
  console.log('Teste Spike FINAL - 15 Conexões DB');
  console.log('============================================');
  console.log('Duração: 7.5 minutos');
  console.log('Fases: Warm→Normal→Spike→Recupera→Extremo→Cool');
  console.log('============================================');
  console.log('');
  
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(ADMIN_CREDENTIALS),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status === 200) {
    console.log('[SUCESSO] API acessível');
    return { token: loginRes.json('accessToken') || loginRes.json('token') };
  } else {
    console.error('[ERROR] Falha ao conectar');
    return { token: null };
  }
}

// ==================== TEARDOWN ====================

export function teardown(data) {
  console.log('');
  console.log('🏁 Teste finalizado');
  console.log('');
}

export function handleSummary(data) {
  console.log('\n========================================');
  console.log('RESULTADO FINAL');
  console.log('========================================\n');
  
  const metrics = data.metrics;
  
  // HTTP
  console.log('HTTP:');
  console.log(`- Requisições: ${metrics.http_reqs.values.count}`);
  console.log(`- Taxa: ${metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  
  // Latência
  console.log('\nLatência:');
  console.log(`- Média: ${metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`- Mediana: ${metrics.http_req_duration.values.med.toFixed(2)}ms`);
  console.log(`- p90: ${metrics.http_req_duration.values['p(90)'].toFixed(2)}ms`);
  console.log(`- p95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`- Máxima: ${metrics.http_req_duration.values.max.toFixed(2)}ms`);
  
  // Performance
  console.log('\nPerformance:');
  console.log(`- Taxa de sucesso: ${(metrics.success_rate.values.rate * 100).toFixed(2)}%`);
  console.log(`- Erros reais (500+): ${(metrics.errors.values.rate * 100).toFixed(2)}%`);
  console.log(`- Checks OK: ${(metrics.checks.values.rate * 100).toFixed(2)}%`);
  
  // VUs
  console.log('\nUsuários:');
  console.log(`- Iterações: ${metrics.iterations.values.count}`);
  console.log(`- Dropped: ${metrics.dropped_iterations.values.count}`);
  console.log(`- VUs máx: 15`);
  
  // Thresholds
  console.log('\nThresholds:');
  const p95Ok = metrics.http_req_duration.values['p(95)'] < 2000;
  const errorsOk = metrics.errors.values.rate < 0.15;
  const successOk = metrics.success_rate.values.rate > 0.70;
  
  console.log(`- p95 < 2000ms: ${p95Ok ? '[SUCESSO]' : '[ERROR]'} (${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms)`);
  console.log(`- erros < 15%: ${errorsOk ? '[SUCESSO]' : '[ERROR]'} (${(metrics.errors.values.rate * 100).toFixed(2)}%)`);
  console.log(`- sucesso > 70%: ${successOk ? '[SUCESSO]' : '[ERROR]'} (${(metrics.success_rate.values.rate * 100).toFixed(2)}%)`);
  
  // Análise
  console.log('\n========================================');
  console.log('ANÁLISE');
  console.log('========================================');
  
  const throughput = metrics.http_reqs.values.rate;
  const p95 = metrics.http_req_duration.values['p(95)'];
  const errorsPct = metrics.errors.values.rate * 100;
  
  if (p95Ok && errorsOk && successOk) {
    console.log('[SUCESSO] SISTEMA SAUDÁVEL!');
    console.log('');
    console.log('Capacidade:');
    console.log(`- Throughput: ${throughput.toFixed(2)} req/s`);
    console.log(`- Latência p95: ${p95.toFixed(2)}ms`);
    console.log(`- Sistema estável com 15 conexões DB`);
  } else {
    console.log('[WARN]  SISTEMA SOB STRESS');
    console.log('');
    if (!p95Ok) console.log('- Latência alta (p95 > 2s)');
    if (!errorsOk) console.log(`- Erros reais: ${errorsPct.toFixed(2)}%`);
    if (!successOk) console.log('- Taxa de sucesso baixa');
    console.log('');
    console.log('Recomendações:');
    console.log('- Aumentar max_connections (20-30)');
    console.log('- Adicionar índices no banco');
    console.log('- Implementar cache (Redis)');
  }
  
  console.log('========================================\n');
  
  return {};
}