import AtualizacaoDoChamado from '../database/mongodb/atualizacao.chamado.model';
import type { HistoricoChamadoInput, HistoricoChamadoDocument } from '@shared/@types/historicoChamado';
import { logger } from '@shared/config/logger';

export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

function validarDadosParaSalvar(dados: HistoricoChamadoInput): void {
  if (!dados || typeof dados !== 'object') {
    throw new RepositoryError(
      'Dados do histórico são obrigatórios',
      'INVALID_INPUT'
    );
  }

  const camposObrigatorios: (keyof HistoricoChamadoInput)[] = [
    'chamadoId',
    'tipo',
    'autorId',
    'autorNome',
    'autorEmail'
  ];

  const camposFaltantes = camposObrigatorios.filter(
    campo => !dados[campo] || (typeof dados[campo] === 'string' && !dados[campo]?.trim())
  );

  if (camposFaltantes.length > 0) {
    throw new RepositoryError(
      `Campos obrigatórios ausentes: ${camposFaltantes.join(', ')}`,
      'MISSING_REQUIRED_FIELDS'
    );
  }
}

function validarChamadoId(chamadoId: unknown): asserts chamadoId is string {
  if (!chamadoId || typeof chamadoId !== 'string' || !chamadoId.trim()) {
    throw new RepositoryError(
      'ID do chamado é obrigatório e deve ser uma string válida',
      'INVALID_CHAMADO_ID'
    );
  }
}

function converterParaDocumento(doc: any): HistoricoChamadoDocument {
  return {
    _id: doc._id.toString(),
    chamadoId: doc.chamadoId,
    tipo: doc.tipo,
    de: doc.de ?? null,
    para: doc.para ?? null,
    descricao: doc.descricao ?? '',
    autorId: doc.autorId,
    autorNome: doc.autorNome ?? '',
    autorEmail: doc.autorEmail ?? '',
    dataHora: doc.dataHora,
  };
}

/**
 * Salva o histórico do chamado no MongoDB
 * @param dados - Dados do histórico a ser salvo
 * @returns Documento salvo com _id e dataHora gerados
 * @throws {RepositoryError} Se houver erro de validação ou no banco
 */
export async function salvarHistoricoChamado(
  dados: HistoricoChamadoInput
): Promise<HistoricoChamadoDocument> {
  try {
    logger.debug({
      msg: 'Iniciando salvamento de histórico no MongoDB',
      chamadoId: dados?.chamadoId,
    });

    validarDadosParaSalvar(dados);

    const historico = await AtualizacaoDoChamado.create({
      chamadoId: dados.chamadoId,
      tipo: dados.tipo,
      de: dados.de ?? null,
      para: dados.para ?? null,
      descricao: dados.descricao ?? '',
      autorId: dados.autorId,
      autorNome: dados.autorNome,
      autorEmail: dados.autorEmail,
    });

    logger.debug({
      msg: 'Histórico salvo com sucesso no MongoDB',
      chamadoId: dados.chamadoId,
      historicoId: historico._id.toString(),
    });

    return converterParaDocumento(historico);
  } catch (error) {
    if (error instanceof RepositoryError) {
      logger.error({
        msg: 'Erro de validação ao salvar histórico',
        error: error.message,
        code: error.code,
        chamadoId: dados?.chamadoId,
      });
      throw error;
    }

    logger.error({
      msg: 'Erro ao salvar histórico no MongoDB',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      chamadoId: dados?.chamadoId,
    });

    throw new RepositoryError(
      'Falha ao salvar histórico no banco de dados',
      'DATABASE_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Lista o histórico de um chamado ordenado por data
 * @param chamadoId - ID do chamado
 * @returns Lista de históricos ordenada por dataHora (crescente)
 * @throws {RepositoryError} Se houver erro de validação ou no banco
 */
export async function listarHistoricoChamado(
  chamadoId: string
): Promise<HistoricoChamadoDocument[]> {
  try {
    logger.debug({
      msg: 'Iniciando busca de histórico no MongoDB',
      chamadoId,
    });

    validarChamadoId(chamadoId);

    const historicos = await AtualizacaoDoChamado.find({
      chamadoId: chamadoId.trim(),
    }).sort({ dataHora: 1 });

    logger.debug({
      msg: 'Histórico recuperado do MongoDB',
      chamadoId,
      totalRegistros: historicos.length,
    });

    return historicos.map(converterParaDocumento);
  } catch (error) {
    if (error instanceof RepositoryError) {
      logger.error({
        msg: 'Erro de validação ao buscar histórico',
        error: error.message,
        code: error.code,
        chamadoId,
      });
      throw error;
    }

    logger.error({
      msg: 'Erro ao buscar histórico no MongoDB',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      chamadoId,
    });

    throw new RepositoryError(
      'Falha ao buscar histórico no banco de dados',
      'DATABASE_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}