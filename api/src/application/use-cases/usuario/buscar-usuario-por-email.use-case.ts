import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';
import { USUARIO_SELECT } from './selects';

export async function buscarUsuarioPorEmailUseCase(email: string) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where:  { email: email.toLowerCase() },
      select: USUARIO_SELECT,
    });

    if (!usuario) throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);

    logger.info({ email }, '[USUARIO] Encontrado por email');

    return usuario;
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, email }, '[USUARIO] Erro ao buscar por email');
    throw new UsuarioError('Erro ao buscar usuário', 'GET_BY_EMAIL_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}