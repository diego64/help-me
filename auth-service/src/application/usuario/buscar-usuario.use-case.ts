import { prisma } from '@infrastructure/database/prisma/client';
import { NotFoundError } from '@infrastructure/http/middlewares/error.middleware';

interface BuscarUsuarioOutput {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: string;
  ativo: boolean;
  geradoEm: Date;
  atualizadoEm: Date;
  deletadoEm: Date | null;
}

/**
 * Busca um usuário pelo ID
 * Não retorna password nem refreshToken
 */
export async function buscarUsuarioPorIdUseCase(
  id: string
): Promise<BuscarUsuarioOutput> {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      regra: true,
      ativo: true,
      geradoEm: true,
      atualizadoEm: true,
      deletadoEm: true,
    },
  });

  if (!usuario) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  return usuario;
}

/**
 * Busca um usuário pelo email
 * Não retorna password nem refreshToken
 */
export async function buscarUsuarioPorEmailUseCase(
  email: string
): Promise<BuscarUsuarioOutput> {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      regra: true,
      ativo: true,
      geradoEm: true,
      atualizadoEm: true,
      deletadoEm: true,
    },
  });

  if (!usuario) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  return usuario;
}