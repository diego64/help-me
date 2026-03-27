import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';

interface UploadAvatarInput {
  id: string;
  filename: string;
}

export async function uploadAvatarUseCase(input: UploadAvatarInput) {
  const { id, filename } = input;

  try {
    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) {
      throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    }

    const updated = await prisma.usuario.update({
      where:  { id },
      data:   { avatarUrl: `/uploads/avatars/${filename}` },
      select: { id: true, avatarUrl: true },
    });

    logger.info({ tecnicoId: id, filename }, '[TECNICO] Avatar atualizado');

    return { message: 'Avatar enviado com sucesso', avatarUrl: updated.avatarUrl };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao fazer upload do avatar');
    throw new TecnicoError('Erro ao fazer upload do avatar', 'AVATAR_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}