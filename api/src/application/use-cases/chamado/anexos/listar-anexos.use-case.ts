import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

export async function listarAnexosUseCase(chamadoId: string) {
  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id: chamadoId },
      select: { id: true, OS: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    const anexos = await prisma.anexoChamado.findMany({
      where:   { chamadoId, deletadoEm: null },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true, nomeOriginal: true, mimetype: true, tamanho: true, criadoEm: true,
        autor: { select: { id: true, nome: true, sobrenome: true, email: true } },
      },
    });

    logger.info({ chamadoId, total: anexos.length }, '[CHAMADO] Anexos listados');

    return {
      chamadoOS: chamado.OS,
      total: anexos.length,
      anexos: anexos.map(a => ({
        id:           a.id,
        nomeOriginal: a.nomeOriginal,
        mimetype:     a.mimetype,
        tamanho:      a.tamanho,
        criadoEm:     a.criadoEm,
        autor: {
          id:    a.autor.id,
          nome:  `${a.autor.nome} ${a.autor.sobrenome}`,
          email: a.autor.email,
        },
      })),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao listar anexos');
    throw new ChamadoError('Erro ao listar anexos', 'ANEXO_LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}