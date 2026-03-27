import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT_BASICO } from './selects';

interface CriarServicoInput {
  nome: string;
  descricao?: string;
}

export async function criarServicoUseCase(input: CriarServicoInput) {
  const { nome, descricao } = input;
  const nomeLimpo = nome.trim();

  try {
    const existente = await prisma.servico.findUnique({
      where:  { nome: nomeLimpo },
      select: { id: true, deletadoEm: true },
    });

    if (existente) {
      if (existente.deletadoEm) {
        throw new ServicoError(
          'Já existe um serviço deletado com esse nome. Use a rota de reativação.',
          'DELETED_EXISTS', 409
        );
      }
      throw new ServicoError('Já existe um serviço com esse nome', 'ALREADY_EXISTS', 409);
    }

    const servico = await prisma.servico.create({
      data:   { nome: nomeLimpo, descricao: descricao?.trim() || null },
      select: SERVICO_SELECT_BASICO,
    });

    logger.info({ servicoId: servico.id, nome: servico.nome }, '[SERVICO] Criado');

    return servico;
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, nome }, '[SERVICO] Erro ao criar');
    throw new ServicoError('Erro ao criar serviço', 'CREATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}