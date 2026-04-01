export const TECNICO_SELECT = {
  id:           true,
  nome:         true,
  sobrenome:    true,
  email:        true,
  nivel:        true,
  telefone:     true,
  ramal:        true,
  setor:        true,
  avatarUrl:    true,
  ativo:        true,
  geradoEm:     true,
  atualizadoEm: true,
  deletadoEm:   true,
  regra:        true,
  tecnicoDisponibilidade: {
    where:  { deletadoEm: null },
    select: { id: true, entrada: true, saida: true, ativo: true, geradoEm: true, atualizadoEm: true, deletadoEm: true },
  },
  _count: {
    select: { tecnicoChamados: true },
  },
} as const;

export const TECNICO_SELECT_NIVEL = {
  id:           true,
  nome:         true,
  sobrenome:    true,
  email:        true,
  nivel:        true,
  regra:        true,
  ativo:        true,
  atualizadoEm: true,
} as const;