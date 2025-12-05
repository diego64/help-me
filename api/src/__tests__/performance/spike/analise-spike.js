const fs = require('fs');
const path = require('path');

class K6ResultsAnalyzer {
  constructor(csvPath) {
    this.csvPath = csvPath;
    this.metrics = {
      http_req_duration: [],
      http_req_failed: [],
      http_reqs: [],
      vus: [],
      errors: [],
    };
    this.phases = [];
    this.startTime = null;
  }

  readCSV() {
    console.log('[INFO] Lendo arquivo CSV...\n');
    const content = fs.readFileSync(this.csvPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 3) continue;

      const metricName = parts[0];
      const timestamp = parseFloat(parts[1]);
      const value = parseFloat(parts[2]);

      if (!this.startTime) this.startTime = timestamp;

      const relativeTime = timestamp - this.startTime;

      if (this.metrics[metricName]) {
        this.metrics[metricName].push({ timestamp, relativeTime, value });
      }
    }

    console.log(`[SUCESSO] Arquivo processado: ${lines.length - 1} linhas\n`);
  }

  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  identifyPhases() {
    console.log('[INFO] Identificando fases do teste...\n');

    // Baseado nas configurações do spike.yml
    const phaseDurations = [
      { name: 'Warm-up', duration: 60 },
      { name: 'Carga Normal', duration: 120 },
      { name: 'SPIKE 1', duration: 90 },
      { name: 'Recuperação', duration: 120 },
      { name: 'SPIKE 2', duration: 60 },
      { name: 'Cool-down', duration: 60 },
    ];

    let currentTime = 0;
    for (const phase of phaseDurations) {
      this.phases.push({
        name: phase.name,
        start: currentTime,
        end: currentTime + phase.duration,
      });
      currentTime += phase.duration;
    }
  }

  analyzeByPhase() {
    console.log('[INFO] ANÁLISE POR FASE DO TESTE\n');
    console.log('='.repeat(80));

    for (const phase of this.phases) {
      console.log(`\n🔸 ${phase.name} (${phase.start}s - ${phase.end}s)`);
      console.log('-'.repeat(80));

      // Filtrar métricas da fase
      const phaseDurations = this.metrics.http_req_duration.filter(
        (m) => m.relativeTime >= phase.start && m.relativeTime < phase.end
      );

      const phaseFailed = this.metrics.http_req_failed.filter(
        (m) => m.relativeTime >= phase.start && m.relativeTime < phase.end
      );

      const phaseReqs = this.metrics.http_reqs.filter(
        (m) => m.relativeTime >= phase.start && m.relativeTime < phase.end
      );

      if (phaseDurations.length === 0) {
        console.log('[WARN]  Sem dados para esta fase');
        continue;
      }

      // Calcular estatísticas
      const durations = phaseDurations.map((m) => m.value);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const p50 = this.calculatePercentile(durations, 50);
      const p95 = this.calculatePercentile(durations, 95);
      const p99 = this.calculatePercentile(durations, 99);

      // Taxa de erro
      const totalReqs = phaseReqs.length;
      const failedReqs = phaseFailed.filter((m) => m.value === 1).length;
      const errorRate = totalReqs > 0 ? (failedReqs / totalReqs) * 100 : 0;

      // Throughput
      const phaseDuration = phase.end - phase.start;
      const throughput = totalReqs / phaseDuration;

      console.log(`
  Latência:
    • Média:  ${avg.toFixed(2)}ms
    • Mínima: ${min.toFixed(2)}ms
    • Máxima: ${max.toFixed(2)}ms
    • p50:    ${p50.toFixed(2)}ms
    • p95:    ${p95.toFixed(2)}ms ${p95 > 1200 ? '❌ ACIMA DO THRESHOLD' : '✅'}
    • p99:    ${p99.toFixed(2)}ms ${p99 > 2500 ? '❌ ACIMA DO THRESHOLD' : '✅'}

  Performance:
    • Total de requisições: ${totalReqs}
    • Throughput:          ${throughput.toFixed(2)} req/s
    • Taxa de erro:        ${errorRate.toFixed(2)}% ${errorRate > 15 ? '❌ ACIMA DO THRESHOLD' : '✅'}
    • Requisições falhas:  ${failedReqs}
      `);

      // Alertas específicos
      if (p95 > 1200) {
        console.log('[WARN]  ALERTA: p95 acima de 1200ms - Performance degradada');
      }
      if (p99 > 2500) {
        console.log('[WARN]  ALERTA: p99 acima de 2500ms - Latências extremas detectadas');
      }
      if (errorRate > 15) {
        console.log('❌ CRÍTICO: Taxa de erro acima de 15% - Sistema instável');
      }
    }
  }

  analyzeRecovery() {
    console.log('\n\n🔄 ANÁLISE DE RECUPERAÇÃO\n');
    console.log('='.repeat(80));

    // Analisar recuperação após SPIKE 1
    const spike1Phase = this.phases[2]; // SPIKE 1
    const recoveryPhase = this.phases[3]; // Recuperação

    const spike1Durations = this.metrics.http_req_duration
      .filter((m) => m.relativeTime >= spike1Phase.start && m.relativeTime < spike1Phase.end)
      .map((m) => m.value);

    const recoveryDurations = this.metrics.http_req_duration
      .filter((m) => m.relativeTime >= recoveryPhase.start && m.relativeTime < recoveryPhase.end)
      .map((m) => m.value);

    if (spike1Durations.length > 0 && recoveryDurations.length > 0) {
      const spike1P95 = this.calculatePercentile(spike1Durations, 95);
      const recoveryP95 = this.calculatePercentile(recoveryDurations, 95);
      const improvement = ((spike1P95 - recoveryP95) / spike1P95) * 100;

      console.log(`
Recuperação após SPIKE 1:
  • p95 durante SPIKE 1:      ${spike1P95.toFixed(2)}ms
  • p95 durante Recuperação:  ${recoveryP95.toFixed(2)}ms
  • Melhoria:                 ${improvement.toFixed(2)}% ${improvement > 30 ? '✅ BOA RECUPERAÇÃO' : '[WARN]  RECUPERAÇÃO LENTA'}
      `);

      if (improvement < 30) {
        console.log('[WARN]  Sistema não se recuperou adequadamente após o spike');
      }
    }
  }

  generateSummary() {
    console.log('\n\n📋 RESUMO GERAL\n');
    console.log('='.repeat(80));

    const allDurations = this.metrics.http_req_duration.map((m) => m.value);
    const allFailed = this.metrics.http_req_failed.filter((m) => m.value === 1).length;
    const totalReqs = this.metrics.http_reqs.length;

    const overallErrorRate = totalReqs > 0 ? (allFailed / totalReqs) * 100 : 0;
    const overallP95 = this.calculatePercentile(allDurations, 95);
    const overallP99 = this.calculatePercentile(allDurations, 99);

    console.log(`
Métricas Globais:
  • Total de requisições:  ${totalReqs}
  • Requisições falhas:    ${allFailed}
  • Taxa de erro geral:    ${overallErrorRate.toFixed(2)}%
  • p95 geral:             ${overallP95.toFixed(2)}ms
  • p99 geral:             ${overallP99.toFixed(2)}ms

Resultado do Teste:
`);

    // Verificar thresholds
    const passed = overallErrorRate <= 15 && overallP95 <= 1200 && overallP99 <= 2500;

    if (passed) {
      console.log('[SUCESSO] TESTE PASSOU - Sistema suportou o spike de carga adequadamente');
    } else {
      console.log('[ERRO] TESTE FALHOU - Sistema apresentou problemas durante o spike');

      if (overallErrorRate > 15) {
        console.log('   • Taxa de erro acima do aceitável');
      }
      if (overallP95 > 1200) {
        console.log('   • Latência p95 acima do threshold');
      }
      if (overallP99 > 2500) {
        console.log('   • Latência p99 acima do threshold');
      }
    }

    console.log('\n' + '='.repeat(80));
  }

  analyze() {
    this.readCSV();
    this.identifyPhases();
    this.analyzeByPhase();
    this.analyzeRecovery();
    this.generateSummary();
  }
}

// Executar análise
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('[ERROR] Erro: Forneça o caminho do arquivo CSV');
    console.log('\nUso: node analyze-k6-results.js <arquivo-csv>');
    console.log('Exemplo: node analyze-k6-results.js results.csv');
    process.exit(1);
  }

  const csvPath = args[0];

  if (!fs.existsSync(csvPath)) {
    console.error(`[ERROR] Erro: Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const analyzer = new K6ResultsAnalyzer(csvPath);
  analyzer.analyze();
}

module.exports = K6ResultsAnalyzer;