import { HistoricoChamadoInput } from '../../@types/historicoChamado';
import { salvarHistoricoChamado, listarHistoricoChamado } from '../repositories/chamadoAtualizacao.repository';

// Salvar histórico quando muda status do chamado
export async function registrarAcaoNoHistorico(params: HistoricoChamadoInput) {
  await salvarHistoricoChamado(params);
}

// Trazer histórico completo para o chamado
export async function buscarHistorico(chamadoId: string) {
  return await listarHistoricoChamado(chamadoId);
}