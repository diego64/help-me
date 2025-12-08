import { check } from 'k6';

// ====== CONFIGURAÇÃO BASE ======
export const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export const CREDENTIALS = {
  admin: {
    email: __ENV.ADMIN_EMAIL || 'admin@helpme.com',
    password: __ENV.ADMIN_PASSWORD || 'Admin123!',
  },
  user: {
    email: __ENV.USER_EMAIL || 'user@helpme.com',
    password: __ENV.USER_PASSWORD || 'User123!',
  },
  tecnico: {
    email: __ENV.TECNICO_EMAIL || 'tecnico@helpme.com',
    password: __ENV.TECNICO_PASSWORD || 'Tecnico123!',
  },
};

// ====== UTILITÁRIOS ======
export function randomString(length = 8) {
  return Math.random().toString(36).substring(2, length + 2);
}

export function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomCPF() {
  return String(randomNumber(10000000000, 99999999999));
}

export function randomEnum(enumArray) {
  return enumArray[randomNumber(0, enumArray.length - 1)];
}

// ====== STATUS CODES ======
export const STATUS = {
  SUCCESS: [200, 201],
  CLIENT_ERROR: [400, 401, 403, 404],
  SERVER_ERROR: [500, 502, 503, 504],
};

export function isSuccess(status) {
  return STATUS.SUCCESS.includes(status);
}

export function isClientError(status) {
  return STATUS.CLIENT_ERROR.includes(status);
}

export function isServerError(status) {
  return STATUS.SERVER_ERROR.includes(status);
}

// ====== HEADERS ======
export function getHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

// ====== VALIDAÇÃO DE RESPOSTA ======
export function validateResponse(res, expectedStatus, metrics = null) {
  const success = check(res, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response time < 3s': (r) => r.timings.duration < 3000,
  });
  
  // Registrar métricas se fornecidas
  if (metrics) {
    metrics.successRate?.add(isSuccess(res.status));
    metrics.errorRate?.add(isServerError(res.status));
    metrics.requestCounter?.add(1);
    
    if (metrics.customTrend) {
      metrics.customTrend.add(res.timings.duration);
    }
  }
  
  return success;
}

// ====== PARSE SEGURO DE JSON ======
export function safeJsonParse(res, defaultValue = null) {
  try {
    return res.json();
  } catch (e) {
    return defaultValue;
  }
}

export function safeJsonGet(res, key, defaultValue = null) {
  try {
    return res.json(key);
  } catch (e) {
    return defaultValue;
  }
}

// ====== SLEEP INTELIGENTE ======
export function smartSleep(min = 0.5, max = 2) {
  return Math.random() * (max - min) + min;
}

// ====== LOG COLORIDO ======
export const LOG = {
  success: (msg) => console.log(`[SUCESSO] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  warn: (msg) => console.log(`[WARN]  ${msg}`),
  info: (msg) => console.log(`[INFO]  ${msg}`),
  debug: (msg) => {
    if (__ENV.DEBUG === 'true') {
      console.log(`[BUSCANDO...] ${msg}`);
    }
  },
};

// ====== ENUMS ======
export const ENUMS = {
  STATUS_CHAMADO: ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO'],
  SETOR: ['RECURSOS_HUMANOS', 'FINANCEIRO', 'TI', 'COMERCIAL', 'OPERACIONAL'],
  PRIORIDADE: ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'],
};

// ====== PESOS PARA CENÁRIOS ======
export function selectScenario(scenarios) {
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const random = Math.random() * totalWeight;
  let sum = 0;

  for (const scenario of scenarios) {
    sum += scenario.weight;
    if (random <= sum) {
      return scenario;
    }
  }
  
  return scenarios[0];
}

// ====== GERADOR DE DADOS FAKE ======
export const FAKE_DATA = {
  nome: () => ['João', 'Maria', 'Pedro', 'Ana', 'Carlos', 'Juliana'][randomNumber(0, 5)],
  sobrenome: () => ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira'][randomNumber(0, 5)],
  email: () => `user.${randomString(8)}@test.com`,
  telefone: () => `(11) 9${randomNumber(1000, 9999)}-${randomNumber(1000, 9999)}`,
  descricao: () => [
    'Problema urgente no sistema',
    'Solicitação de suporte técnico',
    'Dúvida sobre funcionalidade',
    'Erro ao realizar operação',
    'Necessário ajuda com configuração',
  ][randomNumber(0, 4)],
};

// ====== FORMATAÇÃO DE MÉTRICAS ======
export function formatMetrics(metrics) {
  return {
    duration: metrics.http_req_duration?.values,
    requests: metrics.http_reqs?.values,
    errors: metrics.http_req_failed?.values,
    vus: metrics.vus?.values,
  };
}

// ====== ANÁLISE DE PERFORMANCE ======
export function analyzePerformance(data) {
  const metrics = formatMetrics(data.metrics);
  
  const analysis = {
    totalRequests: metrics.requests?.count || 0,
    avgDuration: metrics.duration?.avg || 0,
    p95: metrics.duration?.['p(95)'] || 0,
    p99: metrics.duration?.['p(99)'] || 0,
    errorRate: metrics.errors?.rate || 0,
    throughput: metrics.requests?.rate || 0,
    
    isHealthy() {
      return this.p95 < 2000 && this.errorRate < 0.15;
    },
    
    getGrade() {
      if (this.p95 < 500 && this.errorRate < 0.01) return 'A';
      if (this.p95 < 1000 && this.errorRate < 0.05) return 'B';
      if (this.p95 < 2000 && this.errorRate < 0.15) return 'C';
      return 'D';
    },
  };
  
  return analysis;
}