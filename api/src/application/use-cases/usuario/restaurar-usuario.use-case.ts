import { prisma } from '@infrastructure/database/prisma/client';
import { cacheDel } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';
import { USUARIO_SELECT, REGRAS_USUARIO } from './selects';

export async function restaurarUsuarioUseCase(id: string) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true, email: true, deletadoEm: true },
    });

    if (!usuario || !REGRAS_USUARIO.includes(usuario.regra as any)) throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);
    if (!usuario.deletadoEm) throw new UsuarioError('Usuário não está deletado', 'NOT_DELETED', 400);

    const restaurado = await prisma.usuario.update({
      where:  { id },
      data:   { deletadoEm: null, ativo: true },
      select: USUARIO_SELECT,
    });

    await cacheDel('usuarios:list').catch((err: unknown) => logger.error({ err }, '[USUARIO] Erro ao invalidar cache'));

    logger.info({ usuarioId: id, email: usuario.email }, '[USUARIO] Restaurado');

    return { message: 'Usuário restaurado com sucesso', usuario: restaurado };
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, usuarioId: id }, '[USUARIO] Erro ao restaurar');
    throw new UsuarioError('Erro ao restaurar usuário', 'RESTORE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}