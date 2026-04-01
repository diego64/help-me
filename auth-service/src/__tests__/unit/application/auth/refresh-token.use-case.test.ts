import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request } from 'express'
import type { Usuario, AuditoriaAuth, Regra } from '@prisma/client'

import { refreshTokenUseCase } from '../../../../application/auth/refresh-token.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { verifyToken, generateTokenPair, shouldRotateRefreshToken } from '../../../../shared/config/jwt'
import { logger } from '../../../../shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditoriaAuth: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/jwt', () => ({
  verifyToken: vi.fn(),
  generateTokenPair: vi.fn(),
  shouldRotateRefreshToken: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@infrastructure/http/middlewares/error.middleware', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'UnauthorizedError'
    }
  },
}))

// ─── Factories ───────────────────────────────────────────────────────────────

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeRequest = (overrides = {}): Request =>
  ({
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn().mockReturnValue('Mozilla/5.0'),
    ...overrides,
  } as unknown as Request)

const makeInput = (overrides = {}) => ({
  refreshToken: 'valid_refresh_token',
  ...overrides,
})

const makeDecodedToken = (overrides = {}) => ({
  id: 'usuario-id-123',
  email: 'diego@email.com',
  regra: 'ADMIN',
  exp: Math.floor(Date.now() / 1000) + 604800, // 7 dias
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
  refreshToken: 'valid_refresh_token',
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
} as unknown as Usuario)

const makeAuditoria = (overrides = {}): AuditoriaAuth => ({
  id: 'auditoria-id-123',
  usuarioId: 'usuario-id-123',
  evento: 'TOKEN_RENOVADO',
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  metadata: {},
  criadoEm: DATA_FIXA,
  ...overrides,
} as unknown as AuditoriaAuth)

const makeTokens = () => ({
  accessToken: 'new_access_token',
  refreshToken: 'new_refresh_token',
  expiresIn: '15m',
})

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(verifyToken).mockReturnValue(makeDecodedToken() as any)
  vi.mocked(generateTokenPair).mockReturnValue(makeTokens() as any)
  vi.mocked(shouldRotateRefreshToken).mockReturnValue(false)
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.auditoriaAuth.create).mockResolvedValue(makeAuditoria() as any)
})

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('refreshTokenUseCase', () => {
  describe('validação de input', () => {
    it('deve lançar UnauthorizedError quando refreshToken não for fornecido', async () => {
      await expect(
        refreshTokenUseCase(makeInput({ refreshToken: '' }), makeRequest())
      ).rejects.toThrow('Refresh token não fornecido.')
    })

    it('deve lançar UnauthorizedError com nome correto quando refreshToken ausente', async () => {
      const error = await refreshTokenUseCase(
        makeInput({ refreshToken: '' }),
        makeRequest()
      ).catch(e => e)

      expect(error.name).toBe('UnauthorizedError')
    })
  })

  describe('verificação do refresh token', () => {
    it('deve verificar o token com tipo "refresh"', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(verifyToken).toHaveBeenCalledWith('valid_refresh_token', 'refresh')
    })

    it('deve lançar UnauthorizedError quando token for inválido', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('invalid token')
      })

      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).rejects.toThrow('Refresh token inválido ou expirado.')
    })

    it('deve lançar UnauthorizedError quando token estiver expirado', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('jwt expired')
      })

      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).rejects.toThrow('Refresh token inválido ou expirado.')
    })
  })

  describe('validação do usuário', () => {
    it('deve buscar usuário ativo e não deletado pelo id do token', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'usuario-id-123',
          ativo: true,
          deletadoEm: null,
        },
      })
    })

    it('deve lançar UnauthorizedError quando usuário não for encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).rejects.toThrow('Usuário não encontrado ou inativo.')
    })

    it('deve lançar UnauthorizedError quando usuário estiver inativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).rejects.toThrow('Usuário não encontrado ou inativo.')
    })
  })

  describe('validação do refresh token armazenado', () => {
    it('deve lançar UnauthorizedError quando token não corresponder ao armazenado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ refreshToken: 'outro_token_salvo' })
      )

      await expect(
        refreshTokenUseCase(makeInput({ refreshToken: 'valid_refresh_token' }), makeRequest())
      ).rejects.toThrow('Refresh token inválido.')
    })

    it('deve logar warning quando detectar possível reuse attack', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ refreshToken: 'outro_token_salvo' })
      )

      await refreshTokenUseCase(makeInput(), makeRequest()).catch(() => {})

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usuario-id-123' }),
        '[AUTH] Tentativa de uso de refresh token inválido — possível reuse attack'
      )
    })

    it('deve aceitar quando token corresponder ao armazenado', async () => {
      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).resolves.toBeDefined()
    })
  })

  describe('geração de novos tokens', () => {
    it('deve gerar novo par de tokens passando o usuário e a request', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(generateTokenPair).toHaveBeenCalledWith(
        makeUsuario(),
        expect.any(Object)
      )
    })

    it('deve retornar os novos tokens no formato correto', async () => {
      const result = await refreshTokenUseCase(makeInput(), makeRequest())

      expect(result).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresIn: '15m',
      })
    })

    it('deve sempre atualizar o refreshToken no banco (rotação obrigatória)', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
        data: { refreshToken: 'new_refresh_token' },
      })
    })
  })

  describe('rotação do refresh token', () => {
    it.todo('deve verificar se o token precisa de rotação', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(shouldRotateRefreshToken).toHaveBeenCalledWith(makeDecodedToken())
    })

    it('deve registrar rotacionado como false na auditoria quando não necessário', async () => {
      vi.mocked(shouldRotateRefreshToken).mockReturnValue(false)

      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ rotacionado: false }),
          }),
        })
      )
    })

    it('deve registrar rotacionado como true na auditoria quando necessário', async () => {
      vi.mocked(shouldRotateRefreshToken).mockReturnValue(true)

      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ rotacionado: true }),
          }),
        })
      )
    })
  })

  describe('registro de auditoria', () => {
    it('deve registrar evento TOKEN_RENOVADO na auditoria', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'TOKEN_RENOVADO',
            usuarioId: 'usuario-id-123',
          }),
        })
      )
    })

    it('deve incluir correlationId na auditoria quando fornecido', async () => {
      await refreshTokenUseCase(makeInput(), makeRequest(), 'correlation-abc')

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ correlationId: 'correlation-abc' }),
          }),
        })
      )
    })

    it('deve continuar o fluxo mesmo se o registro de auditoria falhar', async () => {
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(
        new Error('Audit error')
      )

      await expect(
        refreshTokenUseCase(makeInput(), makeRequest())
      ).resolves.toBeDefined()
    })

    it('deve logar erro quando auditoria falhar', async () => {
      const auditError = new Error('Audit error')
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(auditError)

      await refreshTokenUseCase(makeInput(), makeRequest())

      expect(logger.error).toHaveBeenCalledWith(
        { err: auditError },
        'Erro ao registrar auditoria de refresh'
      )
    })
  })

  describe('extração de IP e User-Agent', () => {
    it('deve usar o primeiro IP do header x-forwarded-for', async () => {
      const req = makeRequest({
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
      })

      await refreshTokenUseCase(makeInput(), req)

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

      await refreshTokenUseCase(makeInput(), req)

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

      await refreshTokenUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: 'unknown' }),
        })
      )
    })

    it('deve registrar userAgent como null quando não disponível', async () => {
      const req = makeRequest({
        get: vi.fn().mockReturnValue(undefined),
      })

      await refreshTokenUseCase(makeInput(), req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userAgent: null }),
        })
      )
    })
  })

  describe('output', () => {
    it('deve retornar apenas accessToken, refreshToken e expiresIn', async () => {
      const result = await refreshTokenUseCase(makeInput(), makeRequest())

      expect(Object.keys(result)).toEqual(['accessToken', 'refreshToken', 'expiresIn'])
    })

    it('não deve expor dados do usuário no retorno', async () => {
      const result = await refreshTokenUseCase(makeInput(), makeRequest())

      expect(result).not.toHaveProperty('usuario')
      expect(result).not.toHaveProperty('id')
      expect(result).not.toHaveProperty('email')
    })
  })
})