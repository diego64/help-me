import { ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface ConfirmarPagamentoInput {
  id: string;
  pagadorId: string;
  comprovantePagamentoUrl?: string;
}

export async function confirmarPagamentoUseCase(input: ConfirmarPagamentoInput) {
  const { id, pagadorId, comprovantePagamentoUrl } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:  { id, deletadoEm: null },
      select: { id: true, status: true },
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    if (reembolso.status !== ReembolsoStatus.APROVADO) {
      throw new ReembolsoError(
        'Somente reembolsos aprovados podem ter o pagamento confirmado',
        'STATUS_INVALIDO',
        400
      );
    }

    const atualizado = await prisma.reembolso.update({
      where:   { id },
      data:    {
        status:   ReembolsoStatus.PAGO,
        pagadorId,
        pagoEm:   new Date(),
        comprovantePagamentoUrl: comprovantePagamentoUrl?.trim() ?? undefined,
      },
      include: REEMBOLSO_INCLUDE,
    });

    logger.info({ reembolsoId: id, pagadorId }, '[REEMBOLSO] Pagamento confirmado');

    return { message: 'Pagamento confirmado com sucesso', reembolso: formatarReembolsoResposta(atualizado) };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId: id }, '[REEMBOLSO] Erro ao confirmar pagamento');
    throw new ReembolsoError('Erro ao confirmar pagamento', 'PAYMENT_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
