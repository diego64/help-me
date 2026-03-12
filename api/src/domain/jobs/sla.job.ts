import cron, { ScheduledTask } from 'node-cron';
import { executarChecagemSLA } from '../../domain/jobs/sla-checker.job';

// Roda a cada 5 minutos dentro do horário de expediente (08:00–18:00, seg–sex)
// A própria executarChecagemSLA ignora execuções fora do expediente
const CRON_EXPRESSAO = '*/5 8-18 * * 1-5';

/**
 * Inicializa o cron job de verificação de SLA.
 * Deve ser chamado uma única vez na inicialização da aplicação.
 */
export function iniciarSLAJob(): ScheduledTask {
  if (!cron.validate(CRON_EXPRESSAO)) {
    throw new Error(`Expressão cron inválida: ${CRON_EXPRESSAO}`);
  }

  const job = cron.schedule(CRON_EXPRESSAO, async () => {
    try {
      await executarChecagemSLA();
    } catch (err) {
      console.error('[SLA Job] Erro durante checagem de SLA:', err);
    }
  });

  console.log('[SLA Job] Iniciado — checagem a cada 5 minutos (seg–sex, 08:00–18:00)');

  return job;
}