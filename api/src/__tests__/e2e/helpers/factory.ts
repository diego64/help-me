import { randomUUID } from 'crypto';
import { Regra, NivelTecnico, Setor } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';

// E-mails padrão lidos do .env.test (com fallback)
export const ADMIN_EMAIL   = process.env.ADMIN_EMAIL_TESTE   || 'admin@helpme.com';
export const TECNICO_EMAIL = process.env.TECNICO_EMAIL_TESTE || 'tecnico@helpme.com';
export const USUARIO_EMAIL = process.env.USER_EMAIL_TESTE    || 'user@helpme.com';

export type UsuarioCriado = {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: Regra;
};

/** Cria um usuário ADMIN na base de testes da API. */
export async function criarAdmin(overrides: Partial<{
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  ativo: boolean;
}> = {}): Promise<UsuarioCriado> {
  return prisma.usuario.create({
    data: {
      id:        overrides.id        ?? randomUUID(),
      nome:      overrides.nome      ?? 'Admin',
      sobrenome: overrides.sobrenome ?? 'Teste',
      email:     overrides.email     ?? ADMIN_EMAIL,
      regra:     Regra.ADMIN,
      ativo:     overrides.ativo     ?? true,
    },
    select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
  });
}

/** Cria um usuário TECNICO na base de testes da API. */
export async function criarTecnico(overrides: Partial<{
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  nivel: NivelTecnico;
  setor: Setor;
  ativo: boolean;
}> = {}): Promise<UsuarioCriado> {
  return prisma.usuario.create({
    data: {
      id:        overrides.id        ?? randomUUID(),
      nome:      overrides.nome      ?? 'Tecnico',
      sobrenome: overrides.sobrenome ?? 'Teste',
      email:     overrides.email     ?? TECNICO_EMAIL,
      regra:     Regra.TECNICO,
      nivel:     overrides.nivel     ?? NivelTecnico.N1,
      setor:     overrides.setor     ?? Setor.TECNOLOGIA_INFORMACAO,
      ativo:     overrides.ativo     ?? true,
    },
    select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
  });
}

/** Cria um usuário com regra USUARIO na base de testes da API. */
export async function criarUsuario(overrides: Partial<{
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  setor: Setor;
  ativo: boolean;
  deletadoEm: Date | null;
}> = {}): Promise<UsuarioCriado> {
  return prisma.usuario.create({
    data: {
      id:        overrides.id        ?? randomUUID(),
      nome:      overrides.nome      ?? 'Usuario',
      sobrenome: overrides.sobrenome ?? 'Teste',
      email:     overrides.email     ?? USUARIO_EMAIL,
      regra:     Regra.USUARIO,
      setor:     overrides.setor     ?? Setor.COMERCIAL,
      ativo:     overrides.ativo     ?? true,
      ...(overrides.deletadoEm !== undefined && { deletadoEm: overrides.deletadoEm }),
    },
    select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
  });
}

/** Gera e-mail único para evitar conflito entre testes. */
export function emailUnico(prefixo = 'usuario'): string {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;
}
