import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { cacheDel } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';

interface UploadAvatarInput {
  id: string;
  filename: string;
}

export async function uploadAvatarUsuarioUseCase(input: UploadAvatarInput) {
  const { id, filename } = input;

  try {
    const usuario = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true },
    });

    if (!usuario || usuario.regra !== Regra.USUARIO) {
      throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);
    }

    const updated = await prisma.usuario.update({
      where:  { id },
      data:   { avatarUrl: `/uploads/avatars/${filename}` },
      select: { id: true, avatarUrl: true },
    });

    await cacheDel('usuarios:list').catch((err: unknown) => logger.error({ err }, '[USUARIO] Erro ao invalidar cache'));

    logger.info({ usuarioId: id, filename }, '[USUARIO] Avatar atualizado');

    return { message: 'Avatar enviado com sucesso', avatarUrl: updated.avatarUrl };
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, usuarioId: id }, '[USUARIO] Erro ao fazer upload do avatar');
    throw new UsuarioError('Erro ao fazer upload do avatar', 'AVATAR_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}