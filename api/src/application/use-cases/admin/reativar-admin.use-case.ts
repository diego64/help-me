import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { AdminError } from './errors';

export async function reativarAdminUseCase(id: string) {
  try {
    const admin = await prisma.usuario.findUnique({ where: { id } });

    if (!admin || admin.regra !== 'ADMIN') {
      throw new AdminError('Administrador não encontrado', 'NOT_FOUND', 404);
    }

    if (!admin.deletadoEm && admin.ativo) {
      throw new AdminError('Administrador já está ativo', 'ALREADY_ACTIVE', 400);
    }

    const adminReativado = await prisma.usuario.update({
      where: { id },
      data: { deletadoEm: null, ativo: true },
      select: {
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        regra: true,
        ativo: true,
      },
    });

    logger.info({ adminId: id }, '[ADMIN] Admin reativado');

    return { message: 'Administrador reativado com sucesso', admin: adminReativado };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    logger.error({ error, adminId: id }, '[ADMIN] Erro ao reativar admin');
    throw new AdminError('Erro ao reativar administrador', 'REACTIVATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}