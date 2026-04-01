import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';
import { FILA_SELECT } from './selects';
import { formatarChamadoFila, criarPaginatedResponse, ORDEM_PRIORIDADE } from './formatters';

const PRIORIDADES_BAIXA: PrioridadeChamado[] = ['P4', 'P5'];
const STATUS_FILA: ChamadoStatus[] = [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO];

interface FilaBaixaInput {
  page: number;
  limit: number;
  usuarioId: string;
  usuarioRegra: string;
}

export async function filaBaixaUseCase(input: FilaBaixaInput) {
  const { page, limit, usuarioId, usuarioRegra } = input;
  const skip = (page - 1) * limit;

  try {
    if (usuarioRegra === 'TECNICO') {
      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      if (tecnico?.nivel === NivelTecnico.N2 || tecnico?.nivel === NivelTecnico.N3) {
        throw new FilaError(`Técnicos ${tecnico.nivel} não têm acesso à fila de baixa prioridade`, 'FORBIDDEN', 403);
      }
    }

    const where = {
      status:     { in: STATUS_FILA },
      prioridade: { in: PRIORIDADES_BAIXA },
      deletadoEm: null,
    };

    const [total, chamados] = await Promise.all([
      prisma.chamado.count({ where }),
      prisma.chamado.findMany({ where, select: FILA_SELECT, orderBy: { geradoEm: 'asc' }, take: limit, skip }),
    ]);

    const ordenados = [...chamados].sort((a, b) => {
      const diff = ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
      return diff !== 0 ? diff : new Date(a.geradoEm).getTime() - new Date(b.geradoEm).getTime();
    });

    logger.info({ page, limit, total }, '[FILA] Fila baixa consultada');

    return { fila: 'BAIXA', prioridades: PRIORIDADES_BAIXA, ...criarPaginatedResponse(ordenados.map(formatarChamadoFila), total, page, limit) };
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error }, '[FILA] Erro ao buscar fila baixa');
    throw new FilaError('Erro ao buscar fila de baixa prioridade', 'FILA_BAIXA_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}