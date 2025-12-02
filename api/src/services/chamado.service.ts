import { HistoricoChamadoInput } from '../../@types/historicoChamado';
import { salvarHistoricoChamado, listarHistoricoChamado } from '../repositories/chamadoAtualizacao.repository';

// ==== SALVAR HISTÓRICO QUANDO MUDA STATUS DO CHAMADO ====
export async function registrarAcaoNoHistorico(params: HistoricoChamadoInput) {
  await salvarHistoricoChamado(params);
}

// ==== TRAZER HISTÓRICO COMPLETO PARA O CHAMADO ====
export async function buscarHistorico(chamadoId: string) {
  return await listarHistoricoChamado(chamadoId);
}