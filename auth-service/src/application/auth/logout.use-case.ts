import { prisma } from '@infrastructure/database/prisma/client';
import { cacheSet, REDIS_TTL } from '@infrastructure/database/redis/client';
import { decodeToken } from '@shared/config/jwt';
import { logger } from '@shared/config/logger';
import { Request } from 'express';

interface LogoutInput {
  usuarioId: string;
  accessToken: string;
}

/**
 * Realiza o logout do usuário
 *
 * FLUXO:
 * 1. Adiciona access token na blacklist do Redis (até expirar)
 * 2. Remove refresh token do banco
 * 3. Registra auditoria
 *
 * SEGURANÇA:
 * - Blacklist no Redis invalida o access token imediatamente
 * - TTL da blacklist = tempo restante do access token (não desperdiça memória)
 * - Remoção do refresh token impede renovação futura
 * Inspirado em: OAuth2 token revocation (RFC 7009)
 */
export async function logoutUseCase(
  input: LogoutInput,
  req: Request,
  correlationId?: string
): Promise<void> {
  const { usuarioId, accessToken } = input;

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') ?? null;

  /**
   * Blacklist do access token
   * Adiciona o JTI do token na blacklist do Redis
   * TTL = tempo restante do token para não desperdiçar memória
   * Inspirado em: OAuth2 RFC 7009, JWT blacklist pattern
   */
  const decoded = decodeToken(accessToken);

  if (decoded?.jti) {
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp
      ? Math.max(decoded.exp - now, 1)          // TTL restante do token
      : REDIS_TTL.ACCESS_TOKEN_BLACKLIST;        // Fallback: 15 minutos

    await cacheSet(`jwt:blacklist:${decoded.jti}`, '1', ttl)
      .catch(err => logger.error({ err }, 'Erro ao adicionar token na blacklist'));
  }

  // Impede que o token seja usado para renovar o access token
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { refreshToken: null },
  }).catch(err => logger.error({ err }, 'Erro ao remover refresh token'));

  await prisma.auditoriaAuth.create({
    data: {
      usuarioId,
      evento: 'LOGOUT',
      ip,
      userAgent,
      metadata: { correlationId },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de logout'));

  logger.info({ userId: usuarioId, ip }, '[AUTH] Logout realizado com sucesso');
}