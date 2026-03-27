import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT_BASICO } from './selects';

interface AtualizarServicoInput {
  id: string;
  nome?: string;
  descricao?: string;
}

export async function atualizarServicoUseCase(input: AtualizarServicoInput) {
  const { id, nome, descricao } = input;

  try {
    const servico = await prisma.servico.findUnique({
      where:  { id },
      select: { id: true, nome: true, descricao: true, ativo: true, deletadoEm: true },
    });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);
    if (servico.deletadoEm) throw new ServicoError('Não é possível editar um serviço deletado', 'DELETED', 400);

    const data: Record<string, unknown> = {};

    if (nome !== undefined) {
      const nomeLimpo = nome.trim();
      if (nomeLimpo !== servico.nome) {
        const existente = await prisma.servico.findUnique({ where: { nome: nomeLimpo } });
        if (existente && existente.id !== id) {
          throw new ServicoError('Já existe outro serviço com esse nome', 'ALREADY_EXISTS', 409);
        }
        data.nome = nomeLimpo;
      }
    }

    if (descricao !== undefined) data.descricao = descricao?.trim() || null;

    if (Object.keys(data).length === 0) {
      return await prisma.servico.findUnique({ where: { id }, select: SERVICO_SELECT_BASICO });
    }

    const updated = await prisma.servico.update({ where: { id }, data, select: SERVICO_SELECT_BASICO });

    logger.info({ servicoId: id, nome: updated?.nome }, '[SERVICO] Atualizado');

    return updated;
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao atualizar');
    throw new ServicoError('Erro ao atualizar serviço', 'UPDATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}