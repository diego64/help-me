import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { AdminError } from './errors';

interface AtualizarAdminInput {
  id: string;
  setor?: string;
  telefone?: string;
  ramal?: string;
  avatarUrl?: string;
  ativo?: boolean;
}

export async function atualizarAdminUseCase(input: AtualizarAdminInput) {
  const { id, setor, telefone, ramal, avatarUrl, ativo } = input;

  try {
    const adminExistente = await prisma.usuario.findUnique({ where: { id } });

    if (!adminExistente || adminExistente.regra !== 'ADMIN') {
      throw new AdminError('Administrador não encontrado', 'NOT_FOUND', 404);
    }

    const data: Record<string, unknown> = {};
    if (setor     !== undefined) data.setor     = setor;
    if (telefone  !== undefined) data.telefone  = telefone;
    if (ramal     !== undefined) data.ramal     = ramal;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
    if (ativo     !== undefined) data.ativo     = ativo;

    const admin = await prisma.usuario.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        regra: true,
        setor: true,
        telefone: true,
        ramal: true,
        avatarUrl: true,
        ativo: true,
        geradoEm: true,
        atualizadoEm: true,
      },
    });

    logger.info({ adminId: id }, '[ADMIN] Admin atualizado');

    return admin;
  } catch (error) {
    if (error instanceof AdminError) throw error;
    logger.error({ error, adminId: id }, '[ADMIN] Erro ao atualizar admin');
    throw new AdminError('Erro ao atualizar administrador', 'UPDATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}