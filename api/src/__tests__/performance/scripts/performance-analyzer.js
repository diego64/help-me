const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
  constructor(jsonPath) {
    this.jsonPath = jsonPath;
    this.data = null;
    this.analysis = {
      summary: {},
      byPhase: [],
      byEndpoint: {},
      recommendations: [],
      grade: 'N/A'
    };
  }

  loadData() {
    try {
      const content = fs.readFileSync(this.jsonPath, 'utf-8');
      this.data = JSON.parse(content);
      return true;
    } catch (error) {
      console.error('[ERROR] Erro ao carregar arquivo:', error.message);
      return false;
    }
  }

  analyze() {
    if (!this.loadData()) return;

    this.analyzeSummary();
    this.analyzeEndpoints();
    this.generateRecommendations();
    this.calculateGrade();
  }

  analyzeSummary() {
    const metrics = this.data.metrics;

    this.analysis.summary = {
      totalRequests: metrics.http_reqs?.values.count || 0,
      duration: metrics.http_req_duration?.values || {},
      throughput: metrics.http_reqs?.values.rate || 0,
      errorRate: metrics.http_req_failed?.values.rate || 0,
      successRate: metrics.success_rate?.values.rate || 1,
      vus: {
        min: metrics.vus?.values.min || 0,
        max: metrics.vus?.values.max || 0,
        avg: metrics.vus?.values.avg || 0
      }
    };
  }

  analyzeEndpoints() {
    const metrics = this.data.metrics;

    // Analisar métricas customizadas por endpoint
    ['auth_duration', 'chamado_duration', 'servico_duration', 'usuario_duration'].forEach(metricName => {
      if (metrics[metricName]) {
        const endpointName = metricName.replace('_duration', '');
        this.analysis.byEndpoint[endpointName] = {
          avg: metrics[metricName].values.avg,
          p95: metrics[metricName].values['p(95)'],
          p99: metrics[metricName].values['p(99)'],
          min: metrics[metricName].values.min,
          max: metrics[metricName].values.max
        };
      }
    });
  }

  generateRecommendations() {
    const { summary, byEndpoint } = this.analysis;
    const recommendations = [];

    // Análise de latência
    if (summary.duration['p(95)'] > 2000) {
      recommendations.push({
        type: 'critical',
        title: 'Latência P95 Elevada',
        description: `P95 está em ${summary.duration['p(95)'].toFixed(2)}ms (>2000ms)`,
        actions: [
          'Verificar queries lentas no banco de dados',
          'Adicionar índices nas tabelas mais consultadas',
          'Implementar cache com Redis para consultas frequentes',
          'Considerar paginação para endpoints que retornam muitos dados'
        ]
      });
    }

    // Análise de taxa de erro
    if (summary.errorRate > 0.15) {
      recommendations.push({
        type: 'critical',
        title: 'Taxa de Erro Elevada',
        description: `${(summary.errorRate * 100).toFixed(2)}% das requisições falharam`,
        actions: [
          'Revisar logs de erro da aplicação',
          'Verificar pool de conexões do banco (max_connections)',
          'Analisar timeouts e configurações de recursos',
          'Implementar circuit breaker para operações externas'
        ]
      });
    }

    // Análise de throughput
    if (summary.throughput < 50) {
      recommendations.push({
        type: 'warning',
        title: 'Throughput Baixo',
        description: `Sistema processa apenas ${summary.throughput.toFixed(2)} req/s`,
        actions: [
          'Considerar escalonamento horizontal (múltiplas instâncias)',
          'Otimizar código de controllers e services',
          'Implementar compressão de respostas (gzip)',
          'Revisar middleware pesados'
        ]
      });
    }

    // Análise por endpoint
    Object.entries(byEndpoint).forEach(([endpoint, metrics]) => {
      if (metrics.p95 > 1500) {
        recommendations.push({
          type: 'warning',
          title: `Endpoint '${endpoint}' Lento`,
          description: `P95 de ${metrics.p95.toFixed(2)}ms`,
          actions: [
            `Revisar lógica de negócio no endpoint ${endpoint}`,
            'Verificar se há N+1 queries',
            'Considerar eager loading de relações',
            'Adicionar cache específico para este endpoint'
          ]
        });
      }
    });

    // Recomendações gerais se tudo estiver OK
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        title: 'Sistema Saudável!',
        description: 'Todas as métricas estão dentro do esperado',
        actions: [
          'Continuar monitorando em produção',
          'Considerar testes com maior carga',
          'Implementar alertas baseados nestes thresholds'
        ]
      });
    }

    this.analysis.recommendations = recommendations;
  }

  calculateGrade() {
    const { summary } = this.analysis;
    const p95 = summary.duration['p(95)'];
    const errorRate = summary.errorRate;

    if (p95 < 500 && errorRate < 0.01) {
      this.analysis.grade = 'A';
      this.analysis.gradeDescription = 'Excelente';
      this.analysis.gradeColor = '#00d97e';
    } else if (p95 < 1000 && errorRate < 0.05) {
      this.analysis.grade = 'B';
      this.analysis.gradeDescription = 'Muito Bom';
      this.analysis.gradeColor = '#84cc16';
    } else if (p95 < 2000 && errorRate < 0.15) {
      this.analysis.grade = 'C';
      this.analysis.gradeDescription = 'Aceitável';
      this.analysis.gradeColor = '#f59e0b';
    } else {
      this.analysis.grade = 'D';
      this.analysis.gradeDescription = 'Necessita Melhorias';
      this.analysis.gradeColor = '#ef4444';
    }
  }

  generateHTMLReport() {
    const { summary, byEndpoint, recommendations, grade, gradeDescription, gradeColor } = this.analysis;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Performance - Help-Me API</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .header p {
            font-size: 1.1rem;
            opacity: 0.95;
        }
        .grade-section {
            text-align: center;
            padding: 40px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
        .grade-circle {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: ${gradeColor};
            color: white;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 4rem;
            font-weight: bold;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 20px;
        }
        .grade-desc {
            font-size: 1.5rem;
            color: #333;
            font-weight: 600;
        }
        .content {
            padding: 40px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .metric-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }
        .metric-card h3 {
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            opacity: 0.9;
        }
        .metric-card .value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .metric-card .unit {
            font-size: 0.9rem;
            opacity: 0.8;
        }
        .chart-container {
            margin: 40px 0;
            background: #f8f9fa;
            padding: 30px;
            border-radius: 15px;
        }
        .chart-container h2 {
            margin-bottom: 20px;
            color: #333;
        }
        canvas {
            max-height: 400px;
        }
        .recommendations {
            margin-top: 40px;
        }
        .recommendation-card {
            background: white;
            border-left: 5px solid;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .recommendation-card.critical {
            border-color: #ef4444;
            background: #fef2f2;
        }
        .recommendation-card.warning {
            border-color: #f59e0b;
            background: #fffbeb;
        }
        .recommendation-card.success {
            border-color: #00d97e;
            background: #f0fdf4;
        }
        .recommendation-card h3 {
            margin-bottom: 10px;
            color: #333;
        }
        .recommendation-card p {
            margin-bottom: 15px;
            color: #666;
        }
        .recommendation-card ul {
            list-style: none;
            padding: 0;
        }
        .recommendation-card li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
            color: #444;
        }
        .recommendation-card li:before {
            content: "→";
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>[INFO] Relatório de Performance</h1>
            <p>Help-Me API - ${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div class="grade-section">
            <div class="grade-circle">${grade}</div>
            <div class="grade-desc">${gradeDescription}</div>
        </div>

        <div class="content">
            <h2 style="margin-bottom: 20px;">📈 Métricas Gerais</h2>
            
            <div class="metrics-grid">
                <div class="metric-card">
                    <h3>Total de Requisições</h3>
                    <div class="value">${summary.totalRequests.toLocaleString('pt-BR')}</div>
                    <div class="unit">requisições</div>
                </div>
                
                <div class="metric-card">
                    <h3>Throughput</h3>
                    <div class="value">${summary.throughput.toFixed(2)}</div>
                    <div class="unit">req/s</div>
                </div>
                
                <div class="metric-card">
                    <h3>Latência Média</h3>
                    <div class="value">${summary.duration.avg.toFixed(2)}</div>
                    <div class="unit">ms</div>
                </div>
                
                <div class="metric-card">
                    <h3>P95</h3>
                    <div class="value">${summary.duration['p(95)'].toFixed(2)}</div>
                    <div class="unit">ms</div>
                </div>
                
                <div class="metric-card">
                    <h3>Taxa de Sucesso</h3>
                    <div class="value">${(summary.successRate * 100).toFixed(1)}%</div>
                    <div class="unit">das requisições</div>
                </div>
                
                <div class="metric-card">
                    <h3>Taxa de Erro</h3>
                    <div class="value">${(summary.errorRate * 100).toFixed(2)}%</div>
                    <div class="unit">das requisições</div>
                </div>
            </div>

            <div class="chart-container">
                <h2>[INFO] Distribuição de Latência</h2>
                <canvas id="latencyChart"></canvas>
            </div>

            ${Object.keys(byEndpoint).length > 0 ? `
            <div class="chart-container">
                <h2>🎯 Latência por Endpoint (P95)</h2>
                <canvas id="endpointChart"></canvas>
            </div>
            ` : ''}

            <div class="recommendations">
                <h2 style="margin-bottom: 20px;">[INFO] Recomendações</h2>
                ${recommendations.map(rec => `
                    <div class="recommendation-card ${rec.type}">
                        <h3>${rec.title}</h3>
                        <p>${rec.description}</p>
                        <ul>
                            ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="footer">
            Gerado automaticamente por Performance Analyzer • Help-Me API
        </div>
    </div>

    <script>
        // Gráfico de Latência
        const latencyCtx = document.getElementById('latencyChart').getContext('2d');
        new Chart(latencyCtx, {
            type: 'bar',
            data: {
                labels: ['Min', 'Média', 'Mediana', 'P90', 'P95', 'P99', 'Max'],
                datasets: [{
                    label: 'Latência (ms)',
                    data: [
                        ${summary.duration.min},
                        ${summary.duration.avg},
                        ${summary.duration.med},
                        ${summary.duration['p(90)']},
                        ${summary.duration['p(95)']},
                        ${summary.duration['p(99)']},
                        ${summary.duration.max}
                    ],
                    backgroundColor: 'rgba(102, 126, 234, 0.7)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Tempo (ms)'
                        }
                    }
                }
            }
        });

        ${Object.keys(byEndpoint).length > 0 ? `
        // Gráfico por Endpoint
        const endpointCtx = document.getElementById('endpointChart').getContext('2d');
        new Chart(endpointCtx, {
            type: 'horizontalBar',
            data: {
                labels: ${JSON.stringify(Object.keys(byEndpoint))},
                datasets: [{
                    label: 'P95 (ms)',
                    data: ${JSON.stringify(Object.values(byEndpoint).map(e => e.p95))},
                    backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    borderColor: 'rgba(118, 75, 162, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Tempo (ms)'
                        }
                    }
                }
            }
        });
        ` : ''}
    </script>
</body>
</html>
    `;

    return html;
  }

  saveReport(outputPath) {
    const html = this.generateHTMLReport();
    fs.writeFileSync(outputPath, html);
    console.log(`\n[SUCESSO] Relatório salvo em: ${outputPath}\n`);
  }

  printSummary() {
    const { summary, grade, gradeDescription } = this.analysis;

    console.log('\n' + '='.repeat(70));
    console.log('[INFO] ANÁLISE DE PERFORMANCE');
    console.log('='.repeat(70));
    console.log(`\n🎯 Nota: ${grade} - ${gradeDescription}`);
    console.log(`\n📈 Métricas:`);
    console.log(`   Total: ${summary.totalRequests} requisições`);
    console.log(`   Throughput: ${summary.throughput.toFixed(2)} req/s`);
    console.log(`   Latência P95: ${summary.duration['p(95)'].toFixed(2)}ms`);
    console.log(`   Taxa de erro: ${(summary.errorRate * 100).toFixed(2)}%`);
    console.log('\n' + '='.repeat(70) + '\n');
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('[ERROR] Uso: node analyzer.js <arquivo-json-summary>');
    process.exit(1);
  }

  const analyzer = new PerformanceAnalyzer(args[0]);
  analyzer.analyze();
  analyzer.printSummary();

  const outputPath = args[0].replace('.json', '.html');
  analyzer.saveReport(outputPath);
}

module.exports = PerformanceAnalyzer;