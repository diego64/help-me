import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface DeletarAnexoInput {
  chamadoId: string;
  anexoId: string;
  autorId: string;
  autorRegra: string;
}

export async function deletarAnexoUseCase(input: DeletarAnexoInput) {
  const { chamadoId, anexoId, autorId, autorRegra } = input;

  try {
    const anexo = await prisma.anexoChamado.findUnique({
      where:  { id: anexoId },
      select: { id: true, chamadoId: true, autorId: true, deletadoEm: true },
    });

    if (!anexo || anexo.deletadoEm || anexo.chamadoId !== chamadoId) {
      throw new ChamadoError('Anexo não encontrado', 'NOT_FOUND', 404);
    }

    if (autorRegra !== 'ADMIN' && anexo.autorId !== autorId) {
      throw new ChamadoError('Você só pode remover seus próprios anexos', 'FORBIDDEN', 403);
    }

    await prisma.anexoChamado.update({
      where: { id: anexoId },
      data:  { deletadoEm: new Date() },
    });

    logger.info({ chamadoId, anexoId, autorId }, '[CHAMADO] Anexo deletado');

    return { message: 'Anexo removido com sucesso', id: anexoId };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId, anexoId }, '[CHAMADO] Erro ao deletar anexo');
    throw new ChamadoError('Erro ao remover anexo', 'ANEXO_DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}