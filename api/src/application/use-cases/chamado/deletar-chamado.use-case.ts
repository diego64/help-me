import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';

interface DeletarChamadoInput {
  id: string;
  permanente: boolean;
}

export async function deletarChamadoUseCase(input: DeletarChamadoInput) {
  const { id, permanente } = input;

  try {
    const chamado = await prisma.chamado.findUnique({
      where: { id },
      select: { id: true, OS: true, status: true },
    });

    if (!chamado) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    if (permanente) {
      await prisma.$transaction(async (tx) => {
        await tx.ordemDeServico.deleteMany({ where: { chamadoId: id } });
        await tx.chamado.delete({ where: { id } });
      });

      logger.info({ chamadoId: id, OS: chamado.OS }, '[CHAMADO] Excluído permanentemente');
      return { message: `Chamado ${chamado.OS} excluído permanentemente`, id };
    }

    await prisma.chamado.update({
      where: { id },
      data:  { deletadoEm: new Date() },
    });

    logger.info({ chamadoId: id, OS: chamado.OS }, '[CHAMADO] Soft delete realizado');
    return { message: `Chamado ${chamado.OS} excluído com sucesso`, id };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao deletar');
    throw new ChamadoError('Erro ao deletar o chamado', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}