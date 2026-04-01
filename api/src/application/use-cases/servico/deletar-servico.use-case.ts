import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';

interface DeletarServicoInput {
  id: string;
  permanente: boolean;
}

export async function deletarServicoUseCase(input: DeletarServicoInput) {
  const { id, permanente } = input;

  try {
    const servico = await prisma.servico.findUnique({
      where:  { id },
      select: { id: true, nome: true, ativo: true, deletadoEm: true, _count: { select: { chamados: { where: { deletadoEm: null } } } } },
    });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);

    if (permanente) {
      if (servico._count.chamados > 0) {
        throw new ServicoError(
          `Não é possível deletar permanentemente. Existem ${servico._count.chamados} chamados vinculados.`,
          'HAS_CHAMADOS', 400
        );
      }
      await prisma.servico.delete({ where: { id } });
      logger.info({ servicoId: id, nome: servico.nome }, '[SERVICO] Excluído permanentemente');
      return { message: 'Serviço removido permanentemente', id };
    }

    await prisma.servico.update({ where: { id }, data: { deletadoEm: new Date(), ativo: false } });

    logger.info({ servicoId: id, nome: servico.nome }, '[SERVICO] Soft delete realizado');

    return { message: 'Serviço deletado com sucesso', id };
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao deletar');
    throw new ServicoError('Erro ao deletar serviço', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}