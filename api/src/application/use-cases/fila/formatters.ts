import { PrioridadeChamado } from '@prisma/client';

export const ORDEM_PRIORIDADE: Record<PrioridadeChamado, number> = {
  P1: 1, P2: 2, P3: 3, P4: 4, P5: 5,
};

export function formatarChamadoFila(chamado: any) {
  const agora    = Date.now();
  const abertura = new Date(chamado.geradoEm).getTime();
  const diffMin  = Math.floor((agora - abertura) / (1000 * 60));

  let tempoEspera: string;
  if (diffMin < 60) {
    tempoEspera = `${diffMin} min`;
  } else if (diffMin < 1440) {
    tempoEspera = `${Math.floor(diffMin / 60)}h ${diffMin % 60}min`;
  } else {
    tempoEspera = `${Math.floor(diffMin / 1440)}d ${Math.floor((diffMin % 1440) / 60)}h`;
  }

  return {
    id:           chamado.id,
    OS:           chamado.OS,
    descricao:    chamado.descricao,
    status:       chamado.status,
    prioridade:   chamado.prioridade,
    geradoEm:     chamado.geradoEm,
    atualizadoEm: chamado.atualizadoEm,
    tempoEspera,
    usuario: chamado.usuario
      ? { id: chamado.usuario.id, nome: `${chamado.usuario.nome} ${chamado.usuario.sobrenome}`, email: chamado.usuario.email }
      : null,
    tecnico: chamado.tecnico
      ? { id: chamado.tecnico.id, nome: `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`, email: chamado.tecnico.email }
      : null,
    servicos: chamado.servicos?.map((s: any) => ({ id: s.servico.id, nome: s.servico.nome })) ?? [],
  };
}

export function criarPaginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}