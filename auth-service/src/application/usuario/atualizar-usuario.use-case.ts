import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { hashPassword, validarForcaSenha } from '@shared/config/password';
import { logger } from '@shared/config/logger';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@infrastructure/http/middlewares/error.middleware';
import { publishUsuarioAtualizado, publishSenhaAlterada } from '@infrastructure/messaging/kafka/events/usuario.events';

interface AtualizarUsuarioInput {
  id: string;
  nome?: string;
  sobrenome?: string;
  email?: string;
  password?: string;
  regra?: Regra;
  ativo?: boolean;
}

interface AtualizarUsuarioOutput {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: Regra;
  ativo: boolean;
  atualizadoEm: Date;
}

/**
 * Atualiza dados de um usuário
 *
 * FLUXO:
 * 1. Verifica se usuário existe
 * 2. Valida novo email se fornecido (unicidade)
 * 3. Valida força da nova senha se fornecida
 * 4. Atualiza apenas os campos fornecidos
 * 5. Publica evento correto no Kafka
 */
export async function atualizarUsuarioUseCase(
  input: AtualizarUsuarioInput,
  correlationId?: string
): Promise<AtualizarUsuarioOutput> {
  const { id, nome, sobrenome, email, password, regra, ativo } = input;

  // Verifica se existe
  const usuarioExistente = await prisma.usuario.findUnique({
    where: { id, deletadoEm: null },
  });

  if (!usuarioExistente) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  // Valida novo email
  if (email && email !== usuarioExistente.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestError('Email inválido.');
    }

    const emailEmUso = await prisma.usuario.findUnique({
      where: { email },
    });

    if (emailEmUso && emailEmUso.id !== id) {
      throw new ConflictError('Email já cadastrado.');
    }
  }

  // Monta dados para atualização
  const data: Record<string, unknown> = {};
  let senhaAlterada = false;

  if (nome !== undefined)     data['nome']     = nome;
  if (sobrenome !== undefined) data['sobrenome'] = sobrenome;
  if (email !== undefined)    data['email']    = email;
  if (regra !== undefined)    data['regra']    = regra;
  if (ativo !== undefined)    data['ativo']    = ativo;

  // Valida e hasha nova senha
  if (password) {
    const validacao = validarForcaSenha(password);
    if (!validacao.ehValida) {
      throw new ValidationError('Senha não atende aos requisitos de segurança.', {
        erros: validacao.erros,
        sugestoes: validacao.sugestoes,
      });
    }

    data['password'] = hashPassword(password);
    senhaAlterada = true;
  }

  // Atualiza
  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      regra: true,
      ativo: true,
      atualizadoEm: true,
    },
  });

  // Publica eventos
  const usuarioCompleto = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  await publishUsuarioAtualizado(usuarioCompleto, correlationId);

  if (senhaAlterada) {
    await publishSenhaAlterada(usuarioCompleto, correlationId);
  }

  logger.info({ userId: id }, '[USUARIO] Usuário atualizado com sucesso');

  return usuario;
}