import { NivelTecnico } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';

interface DesvincularChamadoInput {
  paiId: string;
  filhoId: string;
  usuarioId: string;
  usuarioRegra: string;
}

export async function desvincularChamadoUseCase(input: DesvincularChamadoInput) {
  const { paiId, filhoId, usuarioId, usuarioRegra } = input;

  try {
    if (usuarioRegra === 'TECNICO') {
      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      if (!tecnico || tecnico.nivel === NivelTecnico.N1) {
        throw new ChamadoError('Somente técnicos N2 ou N3 podem desvincular chamados', 'FORBIDDEN', 403);
      }
    }

    const filho = await prisma.chamado.findUnique({
      where:  { id: filhoId },
      select: { id: true, OS: true, chamadoPaiId: true, deletadoEm: true },
    });

    if (!filho || filho.deletadoEm) throw new ChamadoError('Chamado filho não encontrado', 'NOT_FOUND', 404);
    if (filho.chamadoPaiId !== paiId) throw new ChamadoError(`Chamado ${filho.OS} não é filho do chamado informado`, 'NOT_CHILD', 400);

    await prisma.chamado.update({
      where: { id: filhoId },
      data:  { chamadoPaiId: null, vinculadoEm: null, vinculadoPor: null, atualizadoEm: new Date() },
    });

    logger.info({ paiId, filhoId, usuarioId }, '[CHAMADO] Chamado desvinculado');

    return { message: `Chamado ${filho.OS} desvinculado com sucesso`, filhoId };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, paiId, filhoId }, '[CHAMADO] Erro ao desvincular');
    throw new ChamadoError('Erro ao desvincular chamado', 'UNLINK_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}