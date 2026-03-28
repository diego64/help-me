import { Regra, Usuario } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { hashPassword } from '@shared/config/password';

export const ADMIN_EMAIL   = 'admin.e2e@helpme.com';
export const TECNICO_EMAIL = 'tecnico.e2e@helpme.com';
export const USUARIO_EMAIL = 'usuario.e2e@helpme.com';

export const SENHA_TESTE = 'Admin@12345';

// Hash computado uma vez para reutilização — evita 600k iterações por chamada.
// A variável é lazy: o hash só é gerado na primeira chamada.
let _hashSenhaTeste: string | null = null;

function getHashSenhaTeste(): string {
  if (!_hashSenhaTeste) {
    _hashSenhaTeste = hashPassword(SENHA_TESTE);
  }
  return _hashSenhaTeste;
}

/** Cria um usuário ADMIN diretamente no banco. */
export async function criarAdmin(overrides: Partial<{
  nome: string;
  sobrenome: string;
  email: string;
  ativo: boolean;
}> = {}): Promise<Usuario> {
  return prisma.usuario.create({
    data: {
      nome:       overrides.nome      ?? 'Admin',
      sobrenome:  overrides.sobrenome ?? 'Teste',
      email:      overrides.email     ?? ADMIN_EMAIL,
      password:   getHashSenhaTeste(),
      regra:      Regra.ADMIN,
      ativo:      overrides.ativo     ?? true,
    },
  });
}

/** Cria um usuário TECNICO diretamente no banco. */
export async function criarTecnico(overrides: Partial<{
  nome: string;
  sobrenome: string;
  email: string;
  ativo: boolean;
}> = {}): Promise<Usuario> {
  return prisma.usuario.create({
    data: {
      nome:       overrides.nome      ?? 'Tecnico',
      sobrenome:  overrides.sobrenome ?? 'Teste',
      email:      overrides.email     ?? TECNICO_EMAIL,
      password:   getHashSenhaTeste(),
      regra:      Regra.TECNICO,
      ativo:      overrides.ativo     ?? true,
    },
  });
}

/** Cria um usuário com regra USUARIO diretamente no banco. */
export async function criarUsuario(overrides: Partial<{
  nome: string;
  sobrenome: string;
  email: string;
  ativo: boolean;
  deletadoEm: Date | null;
}> = {}): Promise<Usuario> {
  return prisma.usuario.create({
    data: {
      nome:       overrides.nome      ?? 'Usuario',
      sobrenome:  overrides.sobrenome ?? 'Teste',
      email:      overrides.email     ?? USUARIO_EMAIL,
      password:   getHashSenhaTeste(),
      regra:      Regra.USUARIO,
      ativo:      overrides.ativo     ?? true,
      ...(overrides.deletadoEm !== undefined && { deletadoEm: overrides.deletadoEm }),
    },
  });
}

/**
 * Gera um email único para evitar conflitos entre testes.
 * Ex.: usuario-1714000000000@e2e.test
 */
export function emailUnico(prefixo: string = 'usuario'): string {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.test`;
}
