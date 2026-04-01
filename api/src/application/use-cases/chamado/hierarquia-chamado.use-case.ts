import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

async function buscarArvore(nodeId: string): Promise<any> {
  const node = await prisma.chamado.findUnique({ where: { id: nodeId }, include: CHAMADO_INCLUDE });
  if (!node) return null;

  const filhos = await prisma.chamado.findMany({
    where:   { chamadoPaiId: nodeId, deletadoEm: null },
    select:  { id: true },
    orderBy: { vinculadoEm: 'asc' },
  });

  const filhosArvore = await Promise.all(filhos.map(f => buscarArvore(f.id)));

  return {
    ...formatarChamadoResposta(node),
    chamadoPaiId: node.chamadoPaiId ?? null,
    filhos:       filhosArvore.filter(Boolean),
  };
}

export async function hierarquiaChamadoUseCase(id: string) {
  try {
    const chamadoInicial = await prisma.chamado.findUnique({
      where:  { id },
      select: { chamadoPaiId: true, deletadoEm: true },
    });

    if (!chamadoInicial || chamadoInicial.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    let raizId = id;
    let cursor: { chamadoPaiId: string | null; deletadoEm: Date | null } | null = chamadoInicial;

    while (cursor?.chamadoPaiId) {
      raizId = cursor.chamadoPaiId;
      cursor = await prisma.chamado.findUnique({ where: { id: raizId }, select: { chamadoPaiId: true, deletadoEm: true } });
    }

    const arvore = await buscarArvore(raizId);

    logger.info({ chamadoId: id, raizId }, '[CHAMADO] Hierarquia buscada');

    return { ehRaiz: raizId === id, arvore };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao buscar hierarquia');
    throw new ChamadoError('Erro ao buscar hierarquia do chamado', 'HIERARQUIA_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}