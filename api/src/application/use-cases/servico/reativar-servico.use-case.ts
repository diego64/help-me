import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT_BASICO } from './selects';

export async function reativarServicoUseCase(id: string) {
  try {
    const servico = await prisma.servico.findUnique({
      where:  { id },
      select: { id: true, nome: true, ativo: true, deletadoEm: true },
    });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);
    if (servico.deletadoEm) throw new ServicoError('Não é possível reativar um serviço deletado. Use a rota de restauração.', 'DELETED', 400);
    if (servico.ativo) throw new ServicoError('Serviço já está ativo', 'ALREADY_ACTIVE', 400);

    const reativado = await prisma.servico.update({
      where:  { id },
      data:   { ativo: true },
      select: SERVICO_SELECT_BASICO,
    });

    logger.info({ servicoId: id, nome: servico.nome }, '[SERVICO] Reativado');

    return { message: 'Serviço reativado com sucesso', servico: reativado };
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao reativar');
    throw new ServicoError('Erro ao reativar serviço', 'REACTIVATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}