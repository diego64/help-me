import { Request } from 'express';
import { prisma } from '@infrastructure/database/prisma/client';
import { verifyPassword, precisaRehash, hashPassword } from '@shared/config/password';
import { generateTokenPair } from '@shared/config/jwt';
import { logger } from '@shared/config/logger';
import { UnauthorizedError, BadRequestError } from '@infrastructure/http/middlewares/error.middleware';
import { publishSenhaAlterada } from '@infrastructure/messaging/kafka/events/usuario.events';
import { prisma as prismaClient } from '@infrastructure/database/prisma/client';

interface LoginInput {
  email: string;
  password: string;
}

interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  usuario: {
    id: string;
    nome: string;
    sobrenome: string;
    email: string;
    regra: string;
  };
}
/**
 * Realiza o login do usuário
 *
 * FLUXO:
 * 1. Valida campos obrigatórios
 * 2. Busca usuário por email
 * 3. Verifica senha com timing-safe comparison
 * 4. Rehash automático se necessário (migração de algoritmo)
 * 5. Gera par de tokens (access + refresh com fingerprint)
 * 6. Salva refresh token no banco
 * 7. Registra auditoria
 *
 * SEGURANÇA:
 * - Mensagem de erro genérica (não revela se email existe)
 * - Rehash automático para manter senhas atualizadas
 * - Fingerprint vincula o token ao dispositivo
 * Inspirado em: OWASP Authentication Cheat Sheet
 */
export async function loginUseCase(
  input: LoginInput,
  req: Request,
  correlationId?: string
): Promise<LoginOutput> {
  const { email, password } = input;

  if (!email || !password) {
    throw new BadRequestError('Email e senha são obrigatórios.');
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') ?? null;

  const usuario = await prisma.usuario.findUnique({
    where: { email, deletadoEm: null },
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      password: true,
      regra: true,
      ativo: true,
    },
  });

  // Mensagem genérica — não revela se email existe ou não
  // Inspirado em: OWASP Authentication Cheat Sheet
  if (!usuario || !usuario.ativo) {
    await registrarAuditoriaFalha(null, ip, userAgent, correlationId);
    throw new UnauthorizedError('Email ou senha inválidos.');
  }

  const senhaValida = verifyPassword(password, usuario.password);

  if (!senhaValida) {
    await registrarAuditoriaFalha(usuario.id, ip, userAgent, correlationId);
    throw new UnauthorizedError('Email ou senha inválidos.');
  }

  /** Rehash automático
   * Se o hash usa algoritmo ou iterações desatualizadas,
  *  atualiza silenciosamente durante o login
  *  Inspirado em: Django password migration, Spring Security
  */
  if (precisaRehash(usuario.password)) {
    const novoHash = hashPassword(password);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { password: novoHash },
    });

    // Notifica via Kafka que a senha foi atualizada
    const usuarioCompleto = await prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
    });
    await publishSenhaAlterada(usuarioCompleto, correlationId);

    logger.info({ userId: usuario.id }, '[AUTH] Hash de senha atualizado automaticamente');
  }

  // Busca usuário completo para gerar tokens
  const usuarioCompleto = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuario.id },
  });

  const tokens = generateTokenPair(usuarioCompleto, req);

  // Salva refresh token
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { refreshToken: tokens.refreshToken },
  });

  await prismaClient.auditoriaAuth.create({
    data: {
      usuarioId: usuario.id,
      evento: 'LOGIN_SUCESSO',
      ip,
      userAgent,
      metadata: { correlationId },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de login'));

  logger.info(
    { userId: usuario.id, regra: usuario.regra, ip },
    '[AUTH] Login realizado com sucesso'
  );

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      email: usuario.email,
      regra: usuario.regra,
    },
  };
}

async function registrarAuditoriaFalha(
  usuarioId: string | null,
  ip: string,
  userAgent: string | null,
  correlationId?: string
): Promise<void> {
  await prismaClient.auditoriaAuth.create({
    data: {
      usuarioId,
      evento: 'LOGIN_FALHA',
      ip,
      userAgent,
      metadata: { correlationId },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de falha'));
}