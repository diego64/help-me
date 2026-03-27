import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';

export async function estatisticasUseCase() {
  try {
    const [
      totalChamados, abertos, emAtendimento, encerrados,
      cancelados, reabertos, semTecnico, porPrioridade,
    ] = await Promise.all([
      prisma.chamado.count({ where: { deletadoEm: null } }),
      prisma.chamado.count({ where: { status: ChamadoStatus.ABERTO, deletadoEm: null } }),
      prisma.chamado.count({ where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null } }),
      prisma.chamado.count({ where: { status: ChamadoStatus.ENCERRADO, deletadoEm: null } }),
      prisma.chamado.count({ where: { status: ChamadoStatus.CANCELADO, deletadoEm: null } }),
      prisma.chamado.count({ where: { status: ChamadoStatus.REABERTO, deletadoEm: null } }),
      prisma.chamado.count({ where: { tecnicoId: null, deletadoEm: null } }),
      prisma.chamado.groupBy({ by: ['prioridade'], where: { deletadoEm: null }, _count: { id: true } }),
    ]);

    const pm = Object.fromEntries(porPrioridade.map(p => [p.prioridade, p._count.id]));

    logger.info('[FILA] Estatísticas consultadas');

    return {
      total: totalChamados,
      porStatus: { abertos, emAtendimento, encerrados, cancelados, reabertos },
      porPrioridade: {
        P1: pm['P1'] ?? 0, P2: pm['P2'] ?? 0, P3: pm['P3'] ?? 0,
        P4: pm['P4'] ?? 0, P5: pm['P5'] ?? 0,
      },
      filaAlta:   (pm['P1'] ?? 0) + (pm['P2'] ?? 0) + (pm['P3'] ?? 0),
      filaBaixa:  (pm['P4'] ?? 0) + (pm['P5'] ?? 0),
      pendentes:  abertos + reabertos,
      semTecnico,
      timestamp:  new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error }, '[FILA] Erro ao buscar estatísticas');
    throw new FilaError('Erro ao buscar estatísticas', 'ESTATISTICAS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}