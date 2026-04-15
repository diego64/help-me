import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';
import { USUARIO_SELECT, REGRAS_USUARIO } from './selects';

export async function buscarUsuarioUseCase(id: string) {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: USUARIO_SELECT });

    if (!usuario || !REGRAS_USUARIO.includes(usuario.regra as any)) {
      throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);
    }

    logger.info({ usuarioId: id }, '[USUARIO] Encontrado');

    return usuario;
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, usuarioId: id }, '[USUARIO] Erro ao buscar');
    throw new UsuarioError('Erro ao buscar usuário', 'GET_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}