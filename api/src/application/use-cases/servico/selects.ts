export const SERVICO_SELECT = {
  id:           true,
  nome:         true,
  descricao:    true,
  ativo:        true,
  geradoEm:     true,
  atualizadoEm: true,
  deletadoEm:   true,
  _count: {
    select: { chamados: { where: { deletadoEm: null } } },
  },
} as const;

export const SERVICO_SELECT_BASICO = {
  id:           true,
  nome:         true,
  descricao:    true,
  ativo:        true,
  geradoEm:     true,
  atualizadoEm: true,
} as const;