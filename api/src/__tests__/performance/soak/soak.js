import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ========================================
// MÉTRICAS CUSTOMIZADAS
// ========================================
const errorRate = new Rate('errors');
const customTrend = new Trend('custom_response_time');
const requestCount = new Counter('total_requests');

// ========================================
// CONFIGURAÇÃO DO TESTE DE SOAK
// ========================================
export const options = {
  stages: [
    // 1. RAMP-UP: Sobe gradualmente até a carga alvo
    { duration: '5m', target: 20 },   // 0 → 20 usuários em 5 min
    
    // 2. SOAK: Mantém carga constante por PERÍODO PROLONGADO
    { duration: '4h', target: 20 },   // 20 usuários por 4 HORAS
    
    // 3. RAMP-DOWN: Desce gradualmente
    { duration: '5m', target: 0 },    // 20 → 0 usuários em 5 min
  ],
  
  // Limites (thresholds) para detectar degradação
  thresholds: {
    // Tempo de resposta não deve degradar com o tempo
    http_req_duration: [
      'p(95)<500',   // 95% das requisições < 500ms
      'p(99)<1000',  // 99% das requisições < 1s
    ],
    // Taxa de erro deve ser baixa durante todo o período
    http_req_failed: ['rate<0.01'],  // < 1% de erro
    errors: ['rate<0.01'],
    
    // Detecção de memory leaks (tempos crescentes)
    'http_req_duration{scenario:steady}': ['p(95)<600'],
  },
  
  // Configurações extras para testes longos
  setupTimeout: '2m',
  teardownTimeout: '2m',
};

// ========================================
// VARIÁVEIS DE AMBIENTE
// ========================================
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@helpme.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Admin123!';
const USER_EMAIL = __ENV.USER_EMAIL || 'user@helpme.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || 'User123!';

// ========================================
// SETUP
// ========================================
export function setup() {
  console.log('[INFO] Iniciando TESTE DE SOAK (Resistência)');
  console.log('[INFO] Duração estimada: ~30min');
  console.log('[INFO] Carga: 20 usuários simultâneos');
  console.log('[INFO] Objetivo: Verificar estabilidade a longo prazo\n');
  
  // Fazer login uma vez e retornar tokens
  const loginPayload = JSON.stringify({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  
  console.log(`[INFO] Tentando conectar em: ${BASE_URL}/auth/login`);
  
  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  });
  
  console.log(`[INFO] Status do login: ${loginRes.status}`);
  
  // Verificar se houve erro de conexão
  if (loginRes.status === 0) {
    console.error('\n' + '='.repeat(70));
    console.error('[ERROR] ERRO: NÃO FOI POSSÍVEL CONECTAR À API');
    console.error('='.repeat(70));
    console.error(`[INFO] URL testada: ${BASE_URL}/auth/login`);
    console.error('');
    console.error('Possíveis causas:');
    console.error('  1. A API não está rodando');
    console.error('  2. A porta está incorreta (esperado: 3333)');
    console.error('  3. Firewall bloqueando a conexão');
    console.error('');
    console.error('Como resolver:');
    console.error('  ✓ Inicie a API: pnpm  (ou yarn dev)');
    console.error('  ✓ Verifique se a API está rodando: curl http://localhost:3333/health');
    console.error('  ✓ Confirme a porta correta no arquivo .env');
    console.error('='.repeat(70) + '\n');
    throw new Error('Setup falhou: não foi possível conectar à API');
  }
  
  if (loginRes.body) {
    const bodyPreview = loginRes.body.length > 200 
      ? loginRes.body.substring(0, 200) + '...' 
      : loginRes.body;
    console.log(`[INFO] Response: ${bodyPreview}`);
  }
  
  if (loginRes.status !== 200) {
    console.error('\n' + '='.repeat(70));
    console.error('[ERROR] ERRO: LOGIN FALHOU');
    console.error('='.repeat(70));
    console.error(`[INFO] Status HTTP: ${loginRes.status}`);
    console.error(`[INFO] Response: ${loginRes.body || 'sem resposta'}`);
    console.error('');
    console.error('Possíveis causas:');
    console.error('  1. Credenciais incorretas');
    console.error('  2. Usuário não existe no banco de dados');
    console.error('  3. Endpoint de login mudou');
    console.error('');
    console.error('Credenciais usadas:');
    console.error(`  Email: ${ADMIN_EMAIL}`);
    console.error(`  Password: ${ADMIN_PASSWORD}`);
    console.error('');
    console.error('Como resolver:');
    console.error('  ✓ Verifique as credenciais no banco de dados');
    console.error('  ✓ Crie o usuário admin se necessário');
    console.error('  ✓ Configure variáveis de ambiente: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD');
    console.error('='.repeat(70) + '\n');
    throw new Error('Setup falhou: login retornou status ' + loginRes.status);
  }
  
  let responseData;
  try {
    responseData = loginRes.json();
  } catch (e) {
    console.error('\n' + '='.repeat(70));
    console.error('[ERROR] RESPOSTA NÃO É JSON VÁLIDO');
    console.error('='.repeat(70));
    console.error(`[INFO] Response body: ${loginRes.body}`);
    console.error(`[WARN] Erro ao parsear: ${e.message}`);
    console.error('='.repeat(70) + '\n');
    throw new Error('Setup falhou: resposta não é JSON válido');
  }
  
  // Verificar se tem accessToken
  if (!responseData || !responseData.accessToken) {
    console.error('\n' + '='.repeat(70));
    console.error('[ERROR] ERRO: ACCESS TOKEN NÃO ENCONTRADO');
    console.error('='.repeat(70));
    console.error('[INFO] Response recebida:');
    console.error(JSON.stringify(responseData, null, 2));
    console.error('');
    console.error('O login retornou 200 mas não contém "accessToken"');
    console.error('Verifique se o formato de resposta da API está correto');
    console.error('='.repeat(70) + '\n');
    throw new Error('Setup falhou: accessToken não encontrado na resposta');
  }
  
  console.log('[SUCESSO] Login inicial bem-sucedido!\n');
  
  return {
    adminToken: responseData.accessToken,
    startTime: Date.now(),
  };
}

// ========================================
// FUNÇÃO PRINCIPAL DO TESTE
// ========================================
export default function(data) {
  if (!data || !data.adminToken) {
    console.error('[ERROR] Dados de setup não disponíveis');
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.adminToken}`,
  };
  
  // ====== CENÁRIO 1: OPERAÇÕES DE LEITURA (70% das operações) ======
  if (Math.random() < 0.7) {
    group('Operações de Leitura', function() {
      // Listar serviços
      const servicosRes = http.get(
        `${BASE_URL}/servico`,
        { headers, tags: { name: 'ListarServicos' } }
      );
      
      check(servicosRes, {
        'Listar serviços OK': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      customTrend.add(servicosRes.timings.duration);
      requestCount.add(1);
      
      // Perfil do usuário
      const meRes = http.get(
        `${BASE_URL}/auth/me`,
        { headers, tags: { name: 'ObterPerfil' } }
      );
      
      check(meRes, {
        'Obter perfil OK': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      customTrend.add(meRes.timings.duration);
      requestCount.add(1);
    });
  }
  
  // ====== CENÁRIO 2: OPERAÇÕES DE ESCRITA (20% das operações) ======
  else if (Math.random() < 0.9) {
    group('Operações de Escrita', function() {
      // Criar serviço
      const timestamp = Date.now();
      const payload = JSON.stringify({
        nome: `Serviço Soak Test ${timestamp}`,
        descricao: 'Criado durante teste de soak',
      });
      
      const createRes = http.post(
        `${BASE_URL}/servico`,
        payload,
        { headers, tags: { name: 'CriarServico' } }
      );
      
      const success = check(createRes, {
        'Criar serviço OK': (r) => r.status === 201,
      });
      
      if (!success) errorRate.add(1);
      
      customTrend.add(createRes.timings.duration);
      requestCount.add(1);
      
      // Se criou com sucesso, excluir depois
      if (createRes.status === 201) {
        const servicoId = createRes.json('id');
        sleep(1); // Aguarda um pouco antes de excluir
        
        const deleteRes = http.del(
          `${BASE_URL}/servico/${servicoId}/excluir`,
          null,
          { headers, tags: { name: 'ExcluirServico' } }
        );
        
        check(deleteRes, {
          'Excluir serviço OK': (r) => r.status === 200,
        }) || errorRate.add(1);
        
        requestCount.add(1);
      }
    });
  }
  
  // ====== CENÁRIO 3: OPERAÇÕES COMPLEXAS (10% das operações) ======
  else {
    group('Operações Complexas', function() {
      // Listar com filtros
      const filteredRes = http.get(
        `${BASE_URL}/servico?incluirInativos=true`,
        { headers, tags: { name: 'ListarComFiltros' } }
      );
      
      check(filteredRes, {
        'Listar com filtros OK': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      customTrend.add(filteredRes.timings.duration);
      requestCount.add(1);
    });
  }
  
  // Pausa realista entre requisições
  sleep(Math.random() * 3 + 2); // Entre 2-5 segundos
}

// ========================================
// TEARDOWN: EXECUTADO UMA VEZ NO FINAL
// ========================================
export function teardown(data) {
  if (!data) return;
  
  const duration = (Date.now() - data.startTime) / 1000 / 60; // em minutos
  
  console.log('\n' + '='.repeat(60));
  console.log('[INFO] TESTE DE SOAK FINALIZADO');
  console.log('='.repeat(60));
  console.log(`[INFO]  Duração real: ${duration.toFixed(2)} minutos`);
  console.log('='.repeat(60) + '\n');
}

// ========================================
// RELATÓRIO
// ========================================

export function handleSummary(data) {
  // Helper para acessar valores de forma segura
  const getMetricValue = (metric, key) => {
    if (!metric || !metric.values) return 0;
    const value = metric.values[key];
    return (value !== undefined && value !== null) ? value : 0;
  };

  const durationMinutes = (data.state && data.state.testRunDurationMs)
    ? data.state.testRunDurationMs / 1000 / 60
    : 0;

  const httpReqsCount = getMetricValue(data.metrics.http_reqs, 'count');
  const httpReqsRate = getMetricValue(data.metrics.http_reqs, 'rate');
  const httpReqDurationAvg = getMetricValue(data.metrics.http_req_duration, 'avg');
  const p95 = getMetricValue(data.metrics.http_req_duration, 'p(95)');
  const p99 = getMetricValue(data.metrics.http_req_duration, 'p(99)');
  const errorRate = getMetricValue(data.metrics.http_req_failed, 'rate');

  console.log('\n' + '='.repeat(70));
  console.log('[INFO] RESUMO DO TESTE DE SOAK (RESISTÊNCIA)');
  console.log('='.repeat(70));
  console.log(`[INFO]  Duração total: ${durationMinutes.toFixed(2)} minutos`);
  console.log(`[INFO]  Total de requisições: ${httpReqsCount}`);
  console.log(`⚡ Requisições/seg (média): ${httpReqsRate.toFixed(2)}`);
  console.log(`[INFO]  Tempo de resposta (média): ${httpReqDurationAvg.toFixed(2)}ms`);
  console.log(`[INFO] P95: ${p95.toFixed(2)}ms`);
  console.log(`[INFO] P99: ${p99.toFixed(2)}ms`);
  console.log(`[ERROR] Taxa de erro: ${(errorRate * 100).toFixed(3)}%`);

  console.log('\n' + '='.repeat(70));
  console.log('[INFO] ANÁLISE DE DEGRADAÇÃO');
  console.log('='.repeat(70));

  if (p95 > 500) {
    console.log('[WARN]  ATENÇÃO: P95 acima de 500ms - possível degradação de performance');
  } else {
    console.log('[SUCESSO] P95 dentro do esperado (< 500ms)');
  }

  if (p99 > 1000) {
    console.log('[WARN]  ATENÇÃO: P99 acima de 1s - possível memory leak ou degradação');
  } else {
    console.log('[SUCESSO] P99 dentro do esperado (< 1s)');
  }

  if (errorRate > 0.01) {
    console.log(`[WARN]  ATENÇÃO: Taxa de erro ${(errorRate * 100).toFixed(2)}% acima do limite (1%)`);
  } else {
    console.log('[SUCESSO] Taxa de erro dentro do aceitável (< 1%)');
  }

  console.log('='.repeat(70) + '\n');


  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const OUTPUT_DIR = __ENV.PWD || '';
  const basePath = `${OUTPUT_DIR}/src/__tests__/performance/soak`;

  return {
    'stdout': '',

    // JSON
    [`${basePath}/soak-summary-${timestamp}.json`]:
      JSON.stringify(data, null, 2),

    // TXT
    [`${basePath}/soak-summary-${timestamp}.txt`]:
`
TESTE DE SOAK - RELATÓRIO FINAL
================================
Data/Hora: ${new Date().toLocaleString('pt-BR')}
Duração: ${durationMinutes.toFixed(2)} minutos
Requisições: ${httpReqsCount}
RPS Médio: ${httpReqsRate.toFixed(2)}
P95: ${p95.toFixed(2)}ms
P99: ${p99.toFixed(2)}ms
Taxa de Erro: ${(errorRate * 100).toFixed(3)}%

ANÁLISE
-------
${p95 > 500 ? '[WARN]  P95 acima de 500ms - possível degradação' : '[SUCESSO] P95 dentro do esperado'}
${p99 > 1000 ? '[WARN]  P99 acima de 1s - possível memory leak' : '[SUCESSO] P99 dentro do esperado'}
${errorRate > 0.01 ? `[WARN]  Taxa de erro ${(errorRate * 100).toFixed(2)}% acima do limite` : '[SUCESSO] Taxa de erro aceitável'}
`.trim(),
  };
}