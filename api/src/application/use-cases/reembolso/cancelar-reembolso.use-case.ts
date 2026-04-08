import { ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface CancelarReembolsoInput {
  id: string;
  usuarioId: string;
  usuarioRegra: string;
}

export async function cancelarReembolsoUseCase(input: CancelarReembolsoInput) {
  const { id, usuarioId, usuarioRegra } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:  { id, deletadoEm: null },
      select: { id: true, status: true, solicitanteId: true },
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    if (usuarioRegra !== 'ADMIN' && reembolso.solicitanteId !== usuarioId) {
      throw new ReembolsoError('Você não tem permissão para cancelar este reembolso', 'FORBIDDEN', 403);
    }

    if (reembolso.status !== ReembolsoStatus.PENDENTE) {
      throw new ReembolsoError(
        'Somente reembolsos pendentes podem ser cancelados',
        'STATUS_INVALIDO',
        400
      );
    }

    const atualizado = await prisma.reembolso.update({
      where:   { id },
      data:    { status: ReembolsoStatus.CANCELADO },
      include: REEMBOLSO_INCLUDE,
    });

    logger.info({ reembolsoId: id, usuarioId }, '[REEMBOLSO] Cancelado');

    return { message: 'Reembolso cancelado com sucesso', reembolso: formatarReembolsoResposta(atualizado) };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId: id }, '[REEMBOLSO] Erro ao cancelar');
    throw new ReembolsoError('Erro ao cancelar reembolso', 'CANCEL_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
