import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface EditarComentarioInput {
  chamadoId: string;
  comentarioId: string;
  comentario: string;
  autorId: string;
  autorRegra: string;
}

export async function editarComentarioUseCase(input: EditarComentarioInput) {
  const { chamadoId, comentarioId, comentario, autorId, autorRegra } = input;

  try {
    const comentarioExistente = await prisma.comentarioChamado.findUnique({
      where:  { id: comentarioId },
      select: {
        id: true, autorId: true, chamadoId: true, deletadoEm: true,
        chamado: { select: { status: true } },
      },
    });

    if (!comentarioExistente || comentarioExistente.deletadoEm || comentarioExistente.chamadoId !== chamadoId) {
      throw new ChamadoError('Comentário não encontrado', 'NOT_FOUND', 404);
    }

    if (autorRegra !== 'ADMIN' && comentarioExistente.autorId !== autorId) {
      throw new ChamadoError('Você só pode editar seus próprios comentários', 'FORBIDDEN', 403);
    }

    if (comentarioExistente.chamado.status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Não é possível editar comentários de chamados cancelados', 'INVALID_STATUS', 400);
    }

    const atualizado = await prisma.comentarioChamado.update({
      where: { id: comentarioId },
      data:  { comentario: comentario.trim() },
      select: {
        id: true, comentario: true, visibilidadeInterna: true,
        criadoEm: true, atualizadoEm: true,
        autor: { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
      },
    });

    logger.info({ chamadoId, comentarioId, autorId }, '[CHAMADO] Comentário editado');

    return {
      message: 'Comentário atualizado com sucesso',
      comentario: {
        id:                  atualizado.id,
        comentario:          atualizado.comentario,
        visibilidadeInterna: atualizado.visibilidadeInterna,
        criadoEm:            atualizado.criadoEm,
        atualizadoEm:        atualizado.atualizadoEm,
        autor: {
          id:    atualizado.autor.id,
          nome:  `${atualizado.autor.nome} ${atualizado.autor.sobrenome}`,
          email: atualizado.autor.email,
          regra: atualizado.autor.regra,
        },
      },
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId, comentarioId }, '[CHAMADO] Erro ao editar comentário');
    throw new ChamadoError('Erro ao editar comentário', 'COMENTARIO_UPDATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}