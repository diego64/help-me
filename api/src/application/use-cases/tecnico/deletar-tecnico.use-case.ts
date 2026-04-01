import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';

interface DeletarTecnicoInput {
  id: string;
  permanente: boolean;
}

export async function deletarTecnicoUseCase(input: DeletarTecnicoInput) {
  const { id, permanente } = input;

  try {
    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: {
        id: true, regra: true, email: true, deletadoEm: true,
        _count: { select: { tecnicoChamados: { where: { deletadoEm: null } } } },
      },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) {
      throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    }

    if (permanente) {
      if (tecnico._count.tecnicoChamados > 0) {
        throw new TecnicoError(
          `Não é possível deletar permanentemente. Existem ${tecnico._count.tecnicoChamados} chamados vinculados.`,
          'HAS_CHAMADOS', 400
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.expediente.deleteMany({ where: { usuarioId: id } });
        await tx.usuario.delete({ where: { id } });
      });

      logger.info({ tecnicoId: id, email: tecnico.email }, '[TECNICO] Excluído permanentemente');
      return { message: 'Técnico removido permanentemente', id };
    }

    await prisma.usuario.update({ where: { id }, data: { deletadoEm: new Date(), ativo: false } });

    logger.info({ tecnicoId: id, email: tecnico.email }, '[TECNICO] Soft delete realizado');

    return { message: 'Técnico deletado com sucesso', id };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao deletar');
    throw new TecnicoError('Erro ao deletar técnico', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}