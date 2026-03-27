import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface CriarComentarioInput {
  chamadoId: string;
  comentario: string;
  visibilidadeInterna: boolean;
  autorId: string;
  autorRegra: string;
}

export async function criarComentarioUseCase(input: CriarComentarioInput) {
  const { chamadoId, comentario, visibilidadeInterna, autorId, autorRegra } = input;

  try {
    if (visibilidadeInterna && autorRegra === 'USUARIO') {
      throw new ChamadoError('Usuários não podem criar comentários internos', 'FORBIDDEN', 403);
    }

    const chamado = await prisma.chamado.findUnique({
      where:  { id: chamadoId },
      select: { id: true, OS: true, status: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    if (chamado.status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Não é possível comentar em chamados cancelados', 'INVALID_STATUS', 400);
    }

    const novoComentario = await prisma.comentarioChamado.create({
      data: {
        chamadoId,
        autorId,
        comentario: comentario.trim(),
        visibilidadeInterna: Boolean(visibilidadeInterna),
      },
      select: {
        id: true, comentario: true, visibilidadeInterna: true,
        criadoEm: true, atualizadoEm: true,
        autor: { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
      },
    });

    logger.info({ chamadoId, autorId, visibilidadeInterna }, '[CHAMADO] Comentário criado');

    return {
      message: 'Comentário adicionado com sucesso',
      comentario: {
        id:                  novoComentario.id,
        comentario:          novoComentario.comentario,
        visibilidadeInterna: novoComentario.visibilidadeInterna,
        criadoEm:            novoComentario.criadoEm,
        atualizadoEm:        novoComentario.atualizadoEm,
        autor: {
          id:    novoComentario.autor.id,
          nome:  `${novoComentario.autor.nome} ${novoComentario.autor.sobrenome}`,
          email: novoComentario.autor.email,
          regra: novoComentario.autor.regra,
        },
      },
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao criar comentário');
    throw new ChamadoError('Erro ao criar comentário', 'COMENTARIO_CREATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}