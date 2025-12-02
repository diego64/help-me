import ChamadoAtualizacao from '../models/chamadoAtualizacao.model';
import type { HistoricoChamadoInput } from '../../@types/historicoChamado';

// ==== SALVAR HISTÓRICO DO CHAMADO ====
export async function salvarHistoricoChamado({ chamadoId, tipo, de, para, descricao, autorId, autorNome, autorEmail }: HistoricoChamadoInput) {
  return await ChamadoAtualizacao.create({
    chamadoId,
    tipo,
    de,
    para,
    descricao,
    autorId,
    autorNome,
    autorEmail
  });
}

// ==== BUSCA DO HISTÓRICO DO CHAMADO ====
export async function listarHistoricoChamado(chamadoId: string) {
  return await ChamadoAtualizacao.find({ chamadoId }).sort({ dataHora: 1 });
}