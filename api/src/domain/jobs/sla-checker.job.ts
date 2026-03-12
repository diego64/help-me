import { prisma } from '../../infrastructure/database/prisma/client';
import { registrarViolacaoSLA } from '../sla/sla.service';
import { isDentroDoExpediente } from '../sla/sla.calculator';

/**
 * Busca todos os chamados com SLA vencido e não marcados ainda,
 * e registra a violação para cada um.
 *
 * Chamado pelo sla.job.ts via cron a cada 5 minutos.
 */
export async function executarChecagemSLA(): Promise<void> {
  const agora = new Date();

  // Fora do expediente → não há motivo para checar
  if (!isDentroDoExpediente(agora)) {
    return;
  }

  const chamadosVencidos = await prisma.chamado.findMany({
    where: {
      status: { in: ['ABERTO', 'EM_ATENDIMENTO', 'REABERTO'] },
      slaDeadline:  { lt: agora },
      slaViolado:   false,
      deletadoEm:   null,
    },
    select: { id: true },
  });

  if (chamadosVencidos.length === 0) return;

  await Promise.allSettled(
    chamadosVencidos.map((c) => registrarViolacaoSLA(c.id)),
  );
}