import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request } from 'express'
import type { Usuario, AuditoriaAuth, Regra } from '@prisma/client'

import { logoutUseCase } from '../../../../application/auth/logout.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { cacheSet, REDIS_TTL } from '../../../../infrastructure/database/redis/client'
import { decodeToken } from '../../../../shared/config/jwt'
import { logger } from '../../../../shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      update: vi.fn(),
    },
    auditoriaAuth: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheSet: vi.fn(),
  REDIS_TTL: {
    ACCESS_TOKEN_BLACKLIST: 900,
  },
}))

vi.mock('@shared/config/jwt', () => ({
  decodeToken: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const makeRequest = (overrides = {}): Request =>
  ({
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn().mockReturnValue('Mozilla/5.0'),
    ...overrides,
  } as unknown as Request)

const makeInput = (overrides = {}) => ({
  usuarioId: 'usuario-id-123',
  accessToken: 'Bearer eyJhbGciOiJIUzI1NiJ9.token',
  ...overrides,
})

const makeDecodedToken = (overrides = {}) => ({
  jti: 'jti-uuid-abc123',
  sub: 'usuario-id-123',
  exp: Math.floor(Date.now() / 1000) + 900,
  ...overrides,
})

const makeUsuario = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: null,
  deletadoEm: null,
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  ...overrides,
} as unknown as Usuario)

const makeAuditoria = (overrides = {}): AuditoriaAuth => ({
  id: 'auditoria-id-123',
  usuarioId: 'usuario-id-123',
  evento: 'LOGOUT',
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  metadata: {},
  criadoEm: new Date(),
  ...overrides,
} as AuditoriaAuth)

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(decodeToken).mockReturnValue(makeDecodedToken() as any)
  vi.mocked(cacheSet).mockResolvedValue(undefined as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario())
  vi.mocked(prisma.auditoriaAuth.create).mockResolvedValue(makeAuditoria())
})

describe('logoutUseCase', () => {
  describe('blacklist do access token no Redis', () => {
    it('deve adicionar o JTI do token na blacklist', async () => {
      await logoutUseCase(makeInput(), makeRequest())

      expect(cacheSet).toHaveBeenCalledWith(
        'jwt:blacklist:jti-uuid-abc123',
        '1',
        expect.any(Number)
      )
    })

    it('deve calcular o TTL com base no tempo restante do token', async () => {
      const now = Math.floor(Date.now() / 1000)
      const exp = now + 500

      vi.mocked(decodeToken).mockReturnValue(makeDecodedToken({ exp }) as any)

      await logoutUseCase(makeInput(), makeRequest())

      const chamada = vi.mocked(cacheSet).mock.calls[0]
      const ttl = chamada[2] as number

      expect(ttl).toBeGreaterThanOrEqual(498)
      expect(ttl).toBeLessThanOrEqual(500)
    })

    it('deve usar TTL padrão quando token não tiver exp', async () => {
      vi.mocked(decodeToken).mockReturnValue(
        makeDecodedToken({ exp: undefined }) as any
      )

      await logoutUseCase(makeInput(), makeRequest())

      expect(cacheSet).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        REDIS_TTL.ACCESS_TOKEN_BLACKLIST
      )
    })

    it('não deve adicionar na blacklist quando token não tiver JTI', async () => {
      vi.mocked(decodeToken).mockReturnValue(
        makeDecodedToken({ jti: undefined }) as any
      )

      await logoutUseCase(makeInput(), makeRequest())

      expect(cacheSet).not.toHaveBeenCalled()
    })

    it('não deve adicionar na blacklist quando decodeToken retornar null', async () => {
      vi.mocked(decodeToken).mockReturnValue(null)

      await logoutUseCase(makeInput(), makeRequest())

      expect(cacheSet).not.toHaveBeenCalled()
    })

    it('deve continuar o logout mesmo se o Redis falhar', async () => {
      vi.mocked(cacheSet).mockRejectedValue(new Error('Redis connection error'))

      await expect(
        logoutUseCase(makeInput(), makeRequest())
      ).resolves.toBeUndefined()

      expect(prisma.usuario.update).toHaveBeenCalled()
    })

    it('deve logar erro quando Redis falhar', async () => {
      const redisError = new Error('Redis connection error')
      vi.mocked(cacheSet).mockRejectedValue(redisError)

      await logoutUseCase(makeInput(), makeRequest())

      expect(logger.error).toHaveBeenCalledWith(
        { err: redisError },
        'Erro ao adicionar token na blacklist'
      )
    })
  })

  describe('remoção do refresh token', () => {
    it('deve remover o refreshToken do banco', async () => {
      await logoutUseCase(makeInput(), makeRequest())

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
        data: { refreshToken: null },
      })
    })

    it('deve continuar o logout mesmo se a remoção do refreshToken falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(
        new Error('Database error')
      )

      await expect(
        logoutUseCase(makeInput(), makeRequest())
      ).resolves.toBeUndefined()

      expect(prisma.auditoriaAuth.create).toHaveBeenCalled()
    })

    it('deve logar erro quando remoção do refreshToken falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await logoutUseCase(makeInput(), makeRequest())

      expect(logger.error).toHaveBeenCalledWith(
        { err: dbError },
        'Erro ao remover refresh token'
      )
    })
  })

  describe('registro de auditoria', () => {
    it('deve registrar evento LOGOUT na auditoria', async () => {
      await logoutUseCase(makeInput(), makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'LOGOUT',
            usuarioId: 'usuario-id-123',
          }),
        })
      )
    })

    it('deve incluir correlationId na auditoria quando fornecido', async () => {
      await logoutUseCase(makeInput(), makeRequest(), 'correlation-xyz')

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { correlationId: 'correlation-xyz' },
          }),
        })
      )
    })

    it('deve registrar auditoria com correlationId undefined quando não fornecido', async () => {
      await logoutUseCase(makeInput(), makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { correlationId: undefined },
          }),
        })
      )
    })

    it('deve continuar o logout mesmo se o registro de auditoria falhar', async () => {
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(
        new Error('Audit error')
      )

      await expect(
        logoutUseCase(makeInput(), makeRequest())
      ).resolves.toBeUndefined()
    })
  })

  describe('extração de IP e User-Agent', () => {
    it('deve usar o primeiro IP do header x-forwarded-for', async () => {
      const req = makeRequest({
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
      })

      await logoutUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: '192.168.1.100' }),
        })
      )
    })

    it('deve usar remoteAddress como fallback quando x-forwarded-for não existir', async () => {
      const req = makeRequest({
        headers: {},
        socket: { remoteAddress: '10.0.0.5' },
      })

      await logoutUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: '10.0.0.5' }),
        })
      )
    })

    it('deve usar "unknown" quando IP não estiver disponível', async () => {
      const req = makeRequest({
        headers: {},
        socket: { remoteAddress: undefined },
      })

      await logoutUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: 'unknown' }),
        })
      )
    })

    it('deve registrar User-Agent na auditoria', async () => {
      const req = makeRequest({
        get: vi.fn().mockReturnValue('Chrome/120.0'),
      })

      await logoutUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: 'Chrome/120.0' }),
        })
      )
    })

    it('deve registrar userAgent como null quando não disponível', async () => {
      const req = makeRequest({
        get: vi.fn().mockReturnValue(undefined),
      })

      await logoutUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: null }),
        })
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar todas as etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(cacheSet).mockImplementation(async () => {
        ordem.push('redis_blacklist')
        return undefined as any
      })

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('remove_refresh_token')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.auditoriaAuth.create).mockImplementation((async () => {
        ordem.push('auditoria')
        return makeAuditoria()
      }) as any)

      await logoutUseCase(makeInput(), makeRequest())

      expect(ordem).toEqual(['redis_blacklist', 'remove_refresh_token', 'auditoria'])
    })

    it('deve retornar void após logout bem-sucedido', async () => {
      const result = await logoutUseCase(makeInput(), makeRequest())

      expect(result).toBeUndefined()
    })
  })
})