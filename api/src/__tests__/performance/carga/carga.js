import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// ====== CONFIGURAÇÃO ======
const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const MIN_VUS = parseInt(__ENV.MIN_VUS) || 1;
const PEAK_VUS = parseInt(__ENV.PEAK_VUS) || 10;

// ====== MÉTRICAS CUSTOMIZADAS ======
const errorRate = new Rate('errors');
const successRate = new Rate('success_rate');
const customTrend = new Trend('custom_response_time');
const requestCounter = new Counter('total_requests');
const activeUsers = new Counter('active_users');

// Métricas por endpoint
const authDuration = new Trend('auth_duration');
const chamadoDuration = new Trend('chamado_duration');
const servicoDuration = new Trend('servico_duration');
const usuarioDuration = new Trend('usuario_duration');

// ====== OPTIONS ======
export const options = {
  scenarios: {
    read_operations: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: MIN_VUS },
        { duration: '1m', target: Math.ceil(PEAK_VUS * 0.6) },
        { duration: '1m', target: PEAK_VUS },
        { duration: '30s', target: 1 },
      ],
      gracefulRampDown: '30s',
      exec: 'readOperations',
    },
    write_operations: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: Math.ceil(PEAK_VUS * 0.3),
      maxVUs: Math.ceil(PEAK_VUS * 0.8),
      stages: [
        { duration: '30s', target: 2 },
        { duration: '1m', target: 5 },
        { duration: '1m', target: 8 },
        { duration: '30s', target: 1 },
      ],
      exec: 'writeOperations',
    },
    complex_operations: {
      executor: 'constant-vus',
      vus: 1,
      duration: '5m',
      startTime: '30s',
      exec: 'complexOperations',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.15'],
    errors: ['rate<0.10'],
    success_rate: ['rate>0.80'],
    'http_req_duration{operation:read}': ['p(95)<1000'],
    'http_req_duration{operation:write}': ['p(95)<2000'],
    'http_req_duration{operation:complex}': ['p(95)<3000'],
    auth_duration: ['p(95)<500'],
    chamado_duration: ['p(95)<1500'],
    servico_duration: ['p(95)<800'],
    usuario_duration: ['p(95)<1000'],
  },
};

// ====== VARIÁVEIS GLOBAIS ======
let authToken = null;

// ====== HELPERS ======
function getHeaders(includeAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (includeAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

function validateResponse(res, expectedStatus = 200) {
  const success = res && res.status === expectedStatus;
  
  if (success) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    successRate.add(0);
    errorRate.add(1);
  }
  
  requestCounter.add(1);
  
  if (res && res.timings) {
    customTrend.add(res.timings.duration);
  }
  
  return success;
}

// ====== SETUP ======
export function setup() {
  console.log(`\n[INFO] Iniciando testes em: ${API_BASE_URL}`);
  console.log(`[INFO] VUs: ${MIN_VUS} → ${PEAK_VUS}`);
  
  // Testar conectividade
  const healthCheck = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'admin@helpme.com',
      password: 'Admin123!'
    }),
    { headers: getHeaders() }
  );
  
  if (healthCheck.status === 200 || healthCheck.status === 201) {
    console.log('[SUCESSO] API acessível\n');
    return { apiAvailable: true };
  } else {
    console.log(`[ERROR] API não acessível (Status: ${healthCheck.status})\n`);
    return { apiAvailable: false };
  }
}

// ====== CENÁRIOS ======

export function readOperations() {
  activeUsers.add(1);
  
  // Login
  const loginRes = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'admin@helpme.com',
      password: 'Admin123!'
    }),
    { 
      headers: getHeaders(),
      tags: { operation: 'read' }
    }
  );
  
  authDuration.add(loginRes.timings.duration);
  
  const loginSuccess = check(loginRes, {
    'Login bem-sucedido': (r) => r.status === 200 || r.status === 201,
  });
  
  if (loginSuccess && loginRes.json('token')) {
    authToken = loginRes.json('token');
    validateResponse(loginRes, 200);
  } else {
    errorRate.add(1);
    sleep(1);
    return;
  }
  
  sleep(0.5);
  
  // Buscar perfil
  const profileRes = http.get(
    `${API_BASE_URL}/auth/me`,
    { 
      headers: getHeaders(true),
      tags: { operation: 'read' }
    }
  );
  
  usuarioDuration.add(profileRes.timings.duration);
  check(profileRes, {
    'Perfil obtido': (r) => r.status === 200,
  });
  validateResponse(profileRes, 200);
  
  sleep(1);
  
  // Listar serviços
  const servicosRes = http.get(
    `${API_BASE_URL}/servico`,
    { 
      headers: getHeaders(true),
      tags: { operation: 'read' }
    }
  );
  
  servicoDuration.add(servicosRes.timings.duration);
  check(servicosRes, {
    'Lista de serviços obtida': (r) => r.status === 200,
  });
  validateResponse(servicosRes, 200);
  
  sleep(1);
  
  // Listar chamados
  const chamadosRes = http.get(
    `${API_BASE_URL}/chamado`,
    { 
      headers: getHeaders(true),
      tags: { operation: 'read' }
    }
  );
  
  chamadoDuration.add(chamadosRes.timings.duration);
  check(chamadosRes, {
    'Lista de chamados obtida': (r) => r.status === 200,
  });
  validateResponse(chamadosRes, 200);
  
  sleep(2);
}

export function writeOperations() {
  // Login
  const loginRes = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'admin@helpme.com',
      password: 'Admin123!'
    }),
    { 
      headers: getHeaders(),
      tags: { operation: 'write' }
    }
  );
  
  if (loginRes.status === 200 || loginRes.status === 201) {
    authToken = loginRes.json('token');
  } else {
    errorRate.add(1);
    return;
  }
  
  sleep(0.5);
  
  // Criar chamado
  const timestamp = Date.now();
  const chamadoRes = http.post(
    `${API_BASE_URL}/chamado`,
    JSON.stringify({
      titulo: `Teste Carga ${timestamp}`,
      descricao: `Chamado de teste criado em ${new Date().toISOString()}`,
      prioridade: 'MEDIA',
      status: 'ABERTO'
    }),
    { 
      headers: getHeaders(true),
      tags: { operation: 'write' }
    }
  );
  
  chamadoDuration.add(chamadoRes.timings.duration);
  check(chamadoRes, {
    'Chamado criado': (r) => r.status === 200 || r.status === 201,
  });
  validateResponse(chamadoRes, 201);
  
  sleep(2);
}

export function complexOperations() {
  // Login
  const loginRes = http.post(
    `${API_BASE_URL}/auth/login`,
    JSON.stringify({
      email: 'admin@helpme.com',
      password: 'Admin123!'
    }),
    { 
      headers: getHeaders(),
      tags: { operation: 'complex' }
    }
  );
  
  if (loginRes.status === 200 || loginRes.status === 201) {
    authToken = loginRes.json('token');
  } else {
    errorRate.add(1);
    sleep(3);
    return;
  }
  
  sleep(1);
  
  // CRUD completo de serviço
  const timestamp = Date.now();
  
  // Create
  const createRes = http.post(
    `${API_BASE_URL}/servico`,
    JSON.stringify({
      nome: `Serviço Teste ${timestamp}`,
      descricao: 'Serviço de teste de carga',
      ativo: true
    }),
    { 
      headers: getHeaders(true),
      tags: { operation: 'complex' }
    }
  );
  
  servicoDuration.add(createRes.timings.duration);
  const servicoId = createRes.json('id');
  
  if (!servicoId) {
    errorRate.add(1);
    sleep(3);
    return;
  }
  
  validateResponse(createRes, 201);
  sleep(1);
  
  // Read
  const readRes = http.get(
    `${API_BASE_URL}/servico/${servicoId}`,
    { 
      headers: getHeaders(true),
      tags: { operation: 'complex' }
    }
  );
  
  servicoDuration.add(readRes.timings.duration);
  validateResponse(readRes, 200);
  sleep(1);
  
  // Update
  const updateRes = http.put(
    `${API_BASE_URL}/servico/${servicoId}`,
    JSON.stringify({
      nome: `Serviço Atualizado ${timestamp}`,
      descricao: 'Serviço atualizado no teste',
      ativo: true
    }),
    { 
      headers: getHeaders(true),
      tags: { operation: 'complex' }
    }
  );
  
  servicoDuration.add(updateRes.timings.duration);
  validateResponse(updateRes, 200);
  sleep(1);
  
  // Delete
  const deleteRes = http.del(
    `${API_BASE_URL}/servico/${servicoId}`,
    null,
    { 
      headers: getHeaders(true),
      tags: { operation: 'complex' }
    }
  );
  
  servicoDuration.add(deleteRes.timings.duration);
  check(deleteRes, {
    'Serviço deletado': (r) => r.status === 200 || r.status === 204,
  });
  validateResponse(deleteRes, 200);
  
  sleep(3);
}

// ====== TEARDOWN ======
export function teardown(data) {
  console.log('\n[SUCESSO] Testes finalizados');
}

// ====== RELATÓRIO HTML ======
export function handleSummary(data) {
  // Calcular nota baseada em P95 e taxa de erro
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const errorRate = data.metrics.http_req_failed?.values.rate || 0;
  
  let grade = 'D';
  if (p95 < 500 && errorRate < 0.01) grade = 'A';
  else if (p95 < 1000 && errorRate < 0.05) grade = 'B';
  else if (p95 < 2000 && errorRate < 0.10) grade = 'C';
  
  const p95Status = p95 < 2000 ? '[APROVADO]' : '[REPROVADO]';
  const errorStatus = errorRate < 0.15 ? '[APROVADO]' : '[REPROVADO]';
  const successRateValue = (1 - errorRate) * 100;
  const successStatus = successRateValue > 80 ? '[APROVADO]' : '[REPROVADO]';
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESUMO FINAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Performance: Nota ${grade}\n`);
  
  console.log('Requisições:');
  console.log(`   Total: ${data.metrics.http_reqs?.values.count || 0}`);
  console.log(`   Taxa: ${(data.metrics.http_reqs?.values.rate || 0).toFixed(2)} req/s\n`);
  
  console.log('    Latência:');
  console.log(`   Média: ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms`);
  console.log(`   P95: ${p95.toFixed(2)}ms ${p95Status}`);
  console.log(`   P99: ${(data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2)}ms\n`);
  
  console.log(`${successStatus} Taxa de Sucesso: ${successRateValue.toFixed(2)}%`);
  console.log(`${errorStatus} Taxa de Erro: ${(errorRate * 100).toFixed(2)}%\n`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    'stdout': '', // Limpar saída padrão do K6
    'summary.html': htmlReport(data),
  };
}