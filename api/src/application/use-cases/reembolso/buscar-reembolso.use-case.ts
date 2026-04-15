import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface BuscarReembolsoInput {
  id: string;
  usuarioAutenticado: { id: string; regra: string };
}

export async function buscarReembolsoUseCase(input: BuscarReembolsoInput) {
  const { id, usuarioAutenticado } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:   { id, deletadoEm: null },
      include: REEMBOLSO_INCLUDE,
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    const { regra, id: usuarioId } = usuarioAutenticado;
    const podeVer = regra === 'ADMIN' || regra === 'GESTOR' || regra === 'COMPRADOR'
      || reembolso.solicitanteId === usuarioId;

    if (!podeVer) {
      throw new ReembolsoError('Acesso negado', 'FORBIDDEN', 403);
    }

    logger.info({ reembolsoId: id, usuarioId }, '[REEMBOLSO] Buscado');

    return formatarReembolsoResposta(reembolso);
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId: id }, '[REEMBOLSO] Erro ao buscar');
    throw new ReembolsoError('Erro ao buscar reembolso', 'FETCH_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
