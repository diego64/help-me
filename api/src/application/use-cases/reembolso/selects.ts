export const REEMBOLSO_INCLUDE = {
  solicitante: { select: { id: true, nome: true, sobrenome: true, email: true, setor: true } },
  aprovador:   { select: { id: true, nome: true, sobrenome: true, email: true } },
  pagador:     { select: { id: true, nome: true, sobrenome: true, email: true } },
} as const;
