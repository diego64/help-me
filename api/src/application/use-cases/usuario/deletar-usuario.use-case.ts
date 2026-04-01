import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { cacheDel } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';

interface DeletarUsuarioInput {
  id: string;
  permanente: boolean;
}

export async function deletarUsuarioUseCase(input: DeletarUsuarioInput) {
  const { id, permanente } = input;

  try {
    const usuario = await prisma.usuario.findUnique({
      where:  { id },
      select: {
        id: true, regra: true, email: true, deletadoEm: true,
        _count: { select: { chamadoOS: { where: { deletadoEm: null } } } },
      },
    });

    if (!usuario || usuario.regra !== Regra.USUARIO) {
      throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);
    }

    if (permanente) {
      if (usuario._count.chamadoOS > 0) {
        throw new UsuarioError(
          `Não é possível deletar permanentemente. Existem ${usuario._count.chamadoOS} chamados vinculados.`,
          'HAS_CHAMADOS', 400
        );
      }

      await prisma.usuario.delete({ where: { id } });
      await cacheDel('usuarios:list').catch((err: unknown) => logger.error({ err }, '[USUARIO] Erro ao invalidar cache'));

      logger.info({ usuarioId: id, email: usuario.email }, '[USUARIO] Excluído permanentemente');
      return { message: 'Usuário removido permanentemente', id };
    }

    await prisma.usuario.update({ where: { id }, data: { deletadoEm: new Date(), ativo: false } });
    await cacheDel('usuarios:list').catch((err: unknown) => logger.error({ err }, '[USUARIO] Erro ao invalidar cache'));

    logger.info({ usuarioId: id, email: usuario.email }, '[USUARIO] Soft delete realizado');

    return { message: 'Usuário deletado com sucesso', id };
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, usuarioId: id }, '[USUARIO] Erro ao deletar');
    throw new UsuarioError('Erro ao deletar usuário', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}