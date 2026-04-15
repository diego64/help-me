import { ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface RejeitarReembolsoInput {
  id: string;
  aprovadorId: string;
  motivoRejeicao: string;
}

export async function rejeitarReembolsoUseCase(input: RejeitarReembolsoInput) {
  const { id, aprovadorId, motivoRejeicao } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:  { id, deletadoEm: null },
      select: { id: true, status: true },
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    if (reembolso.status !== ReembolsoStatus.PENDENTE) {
      throw new ReembolsoError(
        'Somente reembolsos pendentes podem ser rejeitados',
        'STATUS_INVALIDO',
        400
      );
    }

    const atualizado = await prisma.reembolso.update({
      where:   { id },
      data:    {
        status:         ReembolsoStatus.REJEITADO,
        aprovadorId,
        aprovadoEm:     new Date(),
        motivoRejeicao: motivoRejeicao.trim(),
      },
      include: REEMBOLSO_INCLUDE,
    });

    logger.info({ reembolsoId: id, aprovadorId }, '[REEMBOLSO] Rejeitado');

    return { message: 'Reembolso rejeitado', reembolso: formatarReembolsoResposta(atualizado) };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId: id }, '[REEMBOLSO] Erro ao rejeitar');
    throw new ReembolsoError('Erro ao rejeitar reembolso', 'REJECT_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
