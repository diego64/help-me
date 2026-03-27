import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

export async function listarTransferenciasUseCase(chamadoId: string) {
  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id: chamadoId },
      select: { id: true, OS: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    const transferencias = await prisma.transferenciaChamado.findMany({
      where:   { chamadoId },
      orderBy: { transferidoEm: 'desc' },
      select: {
        id:            true,
        motivo:        true,
        transferidoEm: true,
        tecnicoAnterior: { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
        tecnicoNovo:     { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
        transferidor:    { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
      },
    });

    logger.info({ chamadoId, total: transferencias.length }, '[CHAMADO] Transferências listadas');

    return {
      chamadoOS: chamado.OS,
      total: transferencias.length,
      transferencias: transferencias.map(t => ({
        id:            t.id,
        motivo:        t.motivo,
        transferidoEm: t.transferidoEm,
        tecnicoAnterior: t.tecnicoAnterior
          ? { id: t.tecnicoAnterior.id, nome: `${t.tecnicoAnterior.nome} ${t.tecnicoAnterior.sobrenome}`, email: t.tecnicoAnterior.email, nivel: t.tecnicoAnterior.nivel }
          : null,
        tecnicoNovo: { id: t.tecnicoNovo.id, nome: `${t.tecnicoNovo.nome} ${t.tecnicoNovo.sobrenome}`, email: t.tecnicoNovo.email, nivel: t.tecnicoNovo.nivel },
        transferidoPor: { id: t.transferidor.id, nome: `${t.transferidor.nome} ${t.transferidor.sobrenome}`, email: t.transferidor.email, regra: t.transferidor.regra },
      })),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao listar transferências');
    throw new ChamadoError('Erro ao buscar transferências', 'TRANSFERENCIAS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}