import { Regra } from '@prisma/client';

export const REGRAS_USUARIO = [Regra.USUARIO, Regra.COMPRADOR, Regra.GESTOR, Regra.INVENTARIANTE] as const;

export const USUARIO_SELECT = {
  id:           true,
  nome:         true,
  sobrenome:    true,
  email:        true,
  telefone:     true,
  ramal:        true,
  setor:        true,
  avatarUrl:    true,
  ativo:        true,
  regra:        true,
  geradoEm:     true,
  atualizadoEm: true,
  deletadoEm:   true,
  _count: {
    select: { chamadoOS: { where: { deletadoEm: null } } },
  },
} as const;