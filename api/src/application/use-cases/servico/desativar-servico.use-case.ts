import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';

export async function desativarServicoUseCase(id: string) {
  try {
    const servico = await prisma.servico.findUnique({
      where:  { id },
      select: { id: true, nome: true, ativo: true, deletadoEm: true },
    });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);
    if (!servico.ativo) throw new ServicoError('Serviço já está desativado', 'ALREADY_INACTIVE', 400);

    await prisma.servico.update({ where: { id }, data: { ativo: false } });

    logger.info({ servicoId: id, nome: servico.nome }, '[SERVICO] Desativado');

    return { message: 'Serviço desativado com sucesso', id };
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao desativar');
    throw new ServicoError('Erro ao desativar serviço', 'DEACTIVATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}