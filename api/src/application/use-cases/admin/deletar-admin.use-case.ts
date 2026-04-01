import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { AdminError } from './errors';

interface DeletarAdminInput {
  id: string;
  solicitanteId: string;
  permanente: boolean;
}

export async function deletarAdminUseCase(input: DeletarAdminInput) {
  const { id, solicitanteId, permanente } = input;

  try {
    const admin = await prisma.usuario.findUnique({ where: { id } });

    if (!admin || admin.regra !== 'ADMIN') {
      throw new AdminError('Administrador não encontrado', 'NOT_FOUND', 404);
    }

    if (solicitanteId === id) {
      throw new AdminError('Não é possível deletar sua própria conta', 'SELF_DELETE', 400);
    }

    if (permanente) {
      await prisma.usuario.delete({ where: { id } });
      logger.info({ adminId: id }, '[ADMIN] Admin excluído permanentemente');
      return { message: 'Administrador excluído permanentemente', id };
    }

    await prisma.usuario.update({
      where: { id },
      data: { deletadoEm: new Date(), ativo: false },
    });

    logger.info({ adminId: id }, '[ADMIN] Admin desativado');

    return { message: 'Administrador desativado com sucesso', id };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    logger.error({ error, adminId: id }, '[ADMIN] Erro ao deletar admin');
    throw new AdminError('Erro ao deletar administrador', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}