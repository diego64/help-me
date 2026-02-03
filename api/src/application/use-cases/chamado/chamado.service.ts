import { HistoricoChamadoInput } from '../../../shared/@types/historicoChamado';
import { salvarHistoricoChamado, listarHistoricoChamado } from '../../../infrastructure/repositories/atualizacao.chamado.repository';

// ==== SALVAR HISTÓRICO QUANDO MUDA STATUS DO CHAMADO ====
export async function registrarAcaoNoHistorico(params: HistoricoChamadoInput) {
  await salvarHistoricoChamado(params);
}

// ==== TRAZER HISTÓRICO COMPLETO PARA O CHAMADO ====
export async function buscarHistorico(chamadoId: string) {
  return await listarHistoricoChamado(chamadoId);
}