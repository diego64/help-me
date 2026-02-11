import { HistoricoChamadoInput } from '../../../shared/@types/historicoChamado';
import { salvarHistoricoChamado, listarHistoricoChamado, } from '../../../infrastructure/repositories/atualizacao.chamado.repository';
import { logger } from '../../../shared/config/logger';

// Erros personalizados do serviço de histórico
export class HistoricoChamadoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'HistoricoChamadoError';
  }
}

// Valida os dados de entrada do histórico
function validarHistoricoInput(params: HistoricoChamadoInput): void {
  const erros: string[] = [];

  if (!params.chamadoId?.trim()) {
    erros.push('chamadoId é obrigatório');
  }

  if (!params.tipo?.trim()) {
    erros.push('tipo é obrigatório');
  }

  if (!params.autorId?.trim()) {
    erros.push('autorId é obrigatório');
  }

  if (!params.autorNome?.trim()) {
    erros.push('autorNome é obrigatório');
  }

  if (!params.autorEmail?.trim()) {
    erros.push('autorEmail é obrigatório');
  }

  // Validação de email básica
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (params.autorEmail && !emailRegex.test(params.autorEmail)) {
    erros.push('autorEmail deve ser um email válido');
  }

  if (erros.length > 0) {
    throw new HistoricoChamadoError(
      `Dados inválidos: ${erros.join(', ')}`,
      'VALIDATION_ERROR'
    );
  }
}

// Valida o ID do chamado
function validarChamadoId(chamadoId: string): void {
  if (!chamadoId?.trim()) {
    throw new HistoricoChamadoError(
      'chamadoId é obrigatório',
      'VALIDATION_ERROR'
    );
  }
}

/**
 * Registra uma ação no histórico do chamado
 * @param params - Dados da ação a ser registrada
 * @throws {HistoricoChamadoError} Se houver erro de validação ou no repositório
 */
export async function registrarAcaoNoHistorico(
  params: HistoricoChamadoInput
): Promise<void> {
  try {
    logger.info({
      msg: 'Iniciando registro de ação no histórico',
      chamadoId: params.chamadoId,
      tipo: params.tipo,
    });

    validarHistoricoInput(params);

    await salvarHistoricoChamado(params);

    logger.info({
      msg: 'Ação registrada no histórico com sucesso',
      chamadoId: params.chamadoId,
      tipo: params.tipo,
    });
  } catch (error) {
    if (error instanceof HistoricoChamadoError) {
      logger.error({
        msg: 'Erro de validação ao registrar histórico',
        error: error.message,
        chamadoId: params.chamadoId,
      });
      throw error;
    }

    logger.error({
      msg: 'Erro ao registrar ação no histórico',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      chamadoId: params.chamadoId,
    });

    throw new HistoricoChamadoError(
      'Falha ao registrar ação no histórico',
      'REPOSITORY_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Busca o histórico completo de um chamado
 * @param chamadoId - ID do chamado
 * @returns Lista de ações do histórico ordenada por data
 * @throws {HistoricoChamadoError} Se houver erro de validação ou no repositório
 */
export async function buscarHistorico(chamadoId: string) {
  try {
    logger.info({
      msg: 'Iniciando busca de histórico',
      chamadoId,
    });

    validarChamadoId(chamadoId);

    const historico = await listarHistoricoChamado(chamadoId);

    logger.info({
      msg: 'Histórico recuperado com sucesso',
      chamadoId,
      totalRegistros: historico.length,
    });

    return historico;
  } catch (error) {
    if (error instanceof HistoricoChamadoError) {
      logger.error({
        msg: 'Erro de validação ao buscar histórico',
        error: error.message,
        chamadoId,
      });
      throw error;
    }

    logger.error({
      msg: 'Erro ao buscar histórico',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      chamadoId,
    });

    throw new HistoricoChamadoError(
      'Falha ao buscar histórico do chamado',
      'REPOSITORY_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}