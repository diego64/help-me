export const CHAMADO_SELECT = {
  id: true,
  OS: true,
  descricao: true,
  descricaoEncerramento: true,
  status: true,
  prioridade: true,
  geradoEm: true,
  atualizadoEm: true,
  encerradoEm: true,
  deletadoEm: true,
  usuario: {
    select: { id: true, nome: true, sobrenome: true, email: true, setor: true },
  },
  tecnico: {
    select: { id: true, nome: true, sobrenome: true, email: true },
  },
  servicos: {
    select: {
      id: true,
      servicoId: true,
      servico: { select: { id: true, nome: true, descricao: true } },
    },
  },
} as const;

export const FILA_SELECT = {
  id: true,
  OS: true,
  descricao: true,
  status: true,
  prioridade: true,
  geradoEm: true,
  atualizadoEm: true,
  usuario: {
    select: { id: true, nome: true, sobrenome: true, email: true },
  },
  tecnico: {
    select: { id: true, nome: true, sobrenome: true, email: true },
  },
  servicos: {
    select: { servico: { select: { id: true, nome: true } } },
  },
} as const;