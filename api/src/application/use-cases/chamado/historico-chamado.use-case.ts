import { listarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';

export async function historicoUseCase(chamadoId: string) {
  try {
    const historico = await listarHistoricoChamado(chamadoId);
    logger.info({ chamadoId, total: historico.length }, '[CHAMADO] Histórico buscado');
    return historico;
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao buscar histórico');
    throw new ChamadoError('Erro ao buscar histórico', 'HISTORICO_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}