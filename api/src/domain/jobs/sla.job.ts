import cron, { ScheduledTask } from 'node-cron';
import { executarChecagemSLA } from '../../domain/jobs/sla-checker.job';

const CRON_EXPRESSAO = '*/5 8-18 * * 1-5';

export function iniciarSLAJob(): ScheduledTask {
  if (!cron.validate(CRON_EXPRESSAO)) {
    throw new Error(`Expressão cron inválida: ${CRON_EXPRESSAO}`);
  }

  const job = cron.schedule(
    CRON_EXPRESSAO,
    async () => {
      try {
        await executarChecagemSLA();
      } catch (err) {
        console.error('[SLA Job] Erro durante checagem de SLA:', err);
      }
    },
    {
      timezone: 'America/Sao_Paulo'
    }
  );

  console.log('[SLA Job] Iniciado — checagem a cada 5 minutos (seg–sex, 08:00–18:00)');

  return job;
}