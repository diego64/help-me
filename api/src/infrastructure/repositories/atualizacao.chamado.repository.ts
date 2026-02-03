import AtualizacaoDoChamado from '../database/mongodb/atualizacao.chamado.model';
import type { HistoricoChamadoInput } from '../../shared/@types/historicoChamado';

// ==== SALVAR HISTÓRICO DO CHAMADO ====
export async function salvarHistoricoChamado({
  chamadoId,
  tipo,
  de,
  para,
  descricao,
  autorId,
  autorNome,
  autorEmail
}: HistoricoChamadoInput) {
  return await AtualizacaoDoChamado.create({
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
  return await AtualizacaoDoChamado.find({ chamadoId }).sort({ dataHora: 1 });
}