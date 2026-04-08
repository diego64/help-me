import { ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface AprovarReembolsoInput {
  id: string;
  aprovadorId: string;
}

export async function aprovarReembolsoUseCase(input: AprovarReembolsoInput) {
  const { id, aprovadorId } = input;

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
        'Somente reembolsos pendentes podem ser aprovados',
        'STATUS_INVALIDO',
        400
      );
    }

    const atualizado = await prisma.reembolso.update({
      where:   { id },
      data:    { status: ReembolsoStatus.APROVADO, aprovadorId, aprovadoEm: new Date() },
      include: REEMBOLSO_INCLUDE,
    });

    logger.info({ reembolsoId: id, aprovadorId }, '[REEMBOLSO] Aprovado');

    return { message: 'Reembolso aprovado com sucesso', reembolso: formatarReembolsoResposta(atualizado) };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId: id }, '[REEMBOLSO] Erro ao aprovar');
    throw new ReembolsoError('Erro ao aprovar reembolso', 'APPROVE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
