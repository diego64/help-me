import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from '../errors';

interface ListarComprovantesInput {
  reembolsoId: string;
  usuarioId: string;
  usuarioRegra: string;
}

export async function listarComprovantesUseCase(input: ListarComprovantesInput) {
  const { reembolsoId, usuarioId, usuarioRegra } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:  { id: reembolsoId, deletadoEm: null },
      select: { id: true, solicitanteId: true },
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    const podeVer = usuarioRegra === 'ADMIN' || usuarioRegra === 'GESTOR' || usuarioRegra === 'COMPRADOR'
      || reembolso.solicitanteId === usuarioId;

    if (!podeVer) {
      throw new ReembolsoError('Acesso negado', 'FORBIDDEN', 403);
    }

    const comprovantes = await prisma.anexoReembolso.findMany({
      where:   { reembolsoId, deletadoEm: null },
      orderBy: { criadoEm: 'desc' },
      select: {
        id:          true,
        nomeOriginal: true,
        mimetype:    true,
        tamanho:     true,
        objetoMinio: true,
        criadoEm:   true,
        autor:       { select: { id: true, nome: true, sobrenome: true } },
      },
    });

    logger.info({ reembolsoId, total: comprovantes.length }, '[REEMBOLSO] Comprovantes listados');

    return comprovantes.map(c => ({
      id:           c.id,
      nomeOriginal: c.nomeOriginal,
      mimetype:     c.mimetype,
      tamanho:      c.tamanho,
      objetoMinio:  c.objetoMinio,
      criadoEm:     c.criadoEm,
      autor:        { id: c.autor.id, nome: `${c.autor.nome} ${c.autor.sobrenome}` },
    }));
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId }, '[REEMBOLSO] Erro ao listar comprovantes');
    throw new ReembolsoError('Erro ao listar comprovantes', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
