import { Request } from 'express';
import { prisma } from '@infrastructure/database/prisma/client';
import { verifyToken, generateTokenPair, shouldRotateRefreshToken } from '@shared/config/jwt';
import { logger } from '@shared/config/logger';
import { UnauthorizedError } from '@infrastructure/http/middlewares/error.middleware';

interface RefreshTokenInput {
  refreshToken: string;
}

interface RefreshTokenOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Renova o par de tokens usando o refresh token
 *
 * FLUXO:
 * 1. Verifica e decodifica o refresh token
 * 2. Busca usuário e valida refresh token armazenado
 * 3. Rotação automática do refresh token se próximo de expirar
 * 4. Gera novo access token (sempre) + novo refresh token (se necessário)
 * 5. Atualiza refresh token no banco se rotacionado
 * 6. Registra auditoria
 *
 * SEGURANÇA:
 * - Refresh token rotation previne reuse attacks
 * - Valida que o token pertence ao usuário no banco
 * - Usuário inativo não consegue renovar
 * Inspirado em: OAuth2 refresh token rotation, Facebook 2018 token management
 */
export async function refreshTokenUseCase(
  input: RefreshTokenInput,
  req: Request,
  correlationId?: string
): Promise<RefreshTokenOutput> {
  const { refreshToken } = input;

  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token não fornecido.');
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') ?? null;

  // Verifica token
  let decoded;
  try {
    decoded = verifyToken(refreshToken, 'refresh');
  } catch {
    throw new UnauthorizedError('Refresh token inválido ou expirado.');
  }

  // Busca usuário
  const usuario = await prisma.usuario.findUnique({
    where: { id: decoded.id, ativo: true, deletadoEm: null },
  });

  if (!usuario) {
    throw new UnauthorizedError('Usuário não encontrado ou inativo.');
  }

  /**
   * Valida refresh token armazenado
   * Garante que o token pertence a este usuário
   * Previne reuse de tokens revogados via logout
  */
  if (usuario.refreshToken !== refreshToken) {
    logger.warn(
      { userId: usuario.id, ip },
      '[AUTH] Tentativa de uso de refresh token inválido — possível reuse attack'
    );
    throw new UnauthorizedError('Refresh token inválido.');
  }

  // Gera novos tokens
  const tokens = generateTokenPair(usuario, req);

  /**
   * Rotação do refresh token
   * Sempre rotaciona para prevenir reuse attacks
   * Inspirado em: OAuth2 RFC 6749, Facebook token rotation
   */
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { refreshToken: tokens.refreshToken },
  });

  await prisma.auditoriaAuth.create({
    data: {
      usuarioId: usuario.id,
      evento: 'TOKEN_RENOVADO',
      ip,
      userAgent,
      metadata: {
        correlationId,
        rotacionado: shouldRotateRefreshToken(decoded),
      },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de refresh'));

  logger.debug(
    { userId: usuario.id, ip },
    '[AUTH] Token renovado com sucesso'
  );

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  };
}