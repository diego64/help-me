import { Regra, Setor, NivelTecnico } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { hashPassword } from '@shared/config/password';

interface CreateTestUserOptions {
  email: string;
  password: string;
  regra: Regra;
  nome?: string;
  sobrenome?: string;
  setor?: Setor;
  nivel?: NivelTecnico;
  telefone?: string;
  ramal?: string;
  avatarUrl?: string;
}

/**
 * Cria (ou restaura) um usuário no banco para uso em testes,
 * seguindo exatamente a mesma lógica do seed.ts (upsert por email).
 */
export async function createTestUser(options: CreateTestUserOptions) {
  const {
    email,
    password,
    regra,
    nome      = 'Usuário',
    sobrenome = 'Teste',
    setor     = Setor.TECNOLOGIA_INFORMACAO,
    nivel,
    telefone,
    ramal,
    avatarUrl,
  } = options;

  const hashed = hashPassword(password);

  return prisma.usuario.upsert({
    where:  { email },
    update: {
      password:   hashed,
      nivel:      nivel ?? null,
      ativo:      true,
      deletadoEm: null,
    },
    create: {
      nome,
      sobrenome,
      email,
      password: hashed,
      regra,
      setor,
      nivel:     nivel ?? null,
      telefone,
      ramal,
      avatarUrl,
      ativo: true,
    },
  });
}