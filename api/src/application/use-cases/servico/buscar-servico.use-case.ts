import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT } from './selects';

export async function buscarServicoUseCase(id: string) {
  try {
    const servico = await prisma.servico.findUnique({ where: { id }, select: SERVICO_SELECT });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);

    logger.info({ servicoId: id }, '[SERVICO] Encontrado');

    return servico;
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao buscar');
    throw new ServicoError('Erro ao buscar serviço', 'GET_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}