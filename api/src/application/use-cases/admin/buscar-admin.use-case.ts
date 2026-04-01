import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { AdminError } from './errors';
import { ADMIN_SELECT } from './selects';

export async function buscarAdminUseCase(id: string) {
  try {
    const admin = await prisma.usuario.findUnique({
      where: { id },
      select: ADMIN_SELECT,
    });

    if (!admin || admin.regra !== 'ADMIN') {
      throw new AdminError('Administrador não encontrado', 'NOT_FOUND', 404);
    }

    logger.info({ adminId: id }, '[ADMIN] Admin encontrado');

    return admin;
  } catch (error) {
    if (error instanceof AdminError) throw error;
    logger.error({ error, adminId: id }, '[ADMIN] Erro ao buscar admin');
    throw new AdminError('Erro ao buscar administrador', 'GET_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}