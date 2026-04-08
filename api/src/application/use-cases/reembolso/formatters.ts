export function formatarReembolsoResposta(r: any) {
  return {
    id:        r.id,
    numero:    r.numero,
    descricao: r.descricao,
    categoria: r.categoria,
    valor:     Number(r.valor),
    status:    r.status,
    setor:     r.setor ?? null,

    solicitante: r.solicitante
      ? { id: r.solicitante.id, nome: `${r.solicitante.nome} ${r.solicitante.sobrenome}`, email: r.solicitante.email, setor: r.solicitante.setor }
      : null,

    aprovador: r.aprovador
      ? { id: r.aprovador.id, nome: `${r.aprovador.nome} ${r.aprovador.sobrenome}`, email: r.aprovador.email }
      : null,
    aprovadoEm:     r.aprovadoEm     ?? null,
    motivoRejeicao: r.motivoRejeicao ?? null,

    pagador: r.pagador
      ? { id: r.pagador.id, nome: `${r.pagador.nome} ${r.pagador.sobrenome}`, email: r.pagador.email }
      : null,
    pagoEm:                  r.pagoEm                  ?? null,
    comprovantePagamentoUrl: r.comprovantePagamentoUrl  ?? null,

    geradoEm:     r.geradoEm,
    atualizadoEm: r.atualizadoEm,
  };
}
