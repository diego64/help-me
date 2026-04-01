import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface ListarComentariosInput {
  chamadoId: string;
  regra: string;
}

export async function listarComentariosUseCase(input: ListarComentariosInput) {
  const { chamadoId, regra } = input;

  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id: chamadoId },
      select: { id: true, OS: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    const where: any = { chamadoId, deletadoEm: null };
    if (regra === 'USUARIO') where.visibilidadeInterna = false;

    const comentarios = await prisma.comentarioChamado.findMany({
      where,
      orderBy: { criadoEm: 'asc' },
      select: {
        id: true, comentario: true, visibilidadeInterna: true,
        criadoEm: true, atualizadoEm: true,
        autor: { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
      },
    });

    logger.info({ chamadoId, total: comentarios.length }, '[CHAMADO] Comentários listados');

    return {
      chamadoOS: chamado.OS,
      total: comentarios.length,
      comentarios: comentarios.map(c => ({
        id:                  c.id,
        comentario:          c.comentario,
        visibilidadeInterna: c.visibilidadeInterna,
        criadoEm:            c.criadoEm,
        atualizadoEm:        c.atualizadoEm,
        autor: {
          id:    c.autor.id,
          nome:  `${c.autor.nome} ${c.autor.sobrenome}`,
          email: c.autor.email,
          regra: c.autor.regra,
        },
      })),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao listar comentários');
    throw new ChamadoError('Erro ao listar comentários', 'COMENTARIO_LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}