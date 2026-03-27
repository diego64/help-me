export const CHAMADO_INCLUDE = {
  usuario:             { select: { id: true, nome: true, sobrenome: true, email: true, setor: true } },
  tecnico:             { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
  alteradorPrioridade: { select: { id: true, nome: true, sobrenome: true, email: true } },
  servicos: {
    include: { servico: { select: { id: true, nome: true } } },
  },
} as const;

export const DESCRICAO_PRIORIDADE = {
  P1: 'Alta Prioridade',
  P2: 'Urgente',
  P3: 'Urgente',
  P4: 'Baixa Prioridade',
  P5: 'Baixa Prioridade',
} as const;