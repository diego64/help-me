import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Response, NextFunction } from 'express'
import type { Regra } from '@prisma/client'

import { authMiddleware, authorizeRoles, type AuthRequest } from '../../../../../infrastructure/http/middlewares/auth.middlewares'
import { verifyToken, extractTokenFromHeader } from '../../../../../shared/config/jwt'
import { cacheGet } from '../../../../../infrastructure/database/redis/client'
import { prisma } from '../../../../../infrastructure/database/prisma/client'
import { logger } from '../../../../../shared/config/logger'

vi.mock('@shared/config/jwt', () => ({
  verifyToken: vi.fn(),
  extractTokenFromHeader: vi.fn(),
}))

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheGet: vi.fn(),
}))

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const makeReq = (overrides = {}): AuthRequest => ({
  headers: { authorization: 'Bearer token-valido' },
  usuario: undefined,
  ...overrides,
} as unknown as AuthRequest)

const makeRes = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

const makeNext = (): NextFunction => vi.fn()

const makeDecodedToken = (overrides = {}) => ({
  id: 'usuario-id-123',
  jti: 'jti-uuid-abc123',
  sub: 'usuario-id-123',
  exp: Math.floor(Date.now() / 1000) + 900,
  ...overrides,
})

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(extractTokenFromHeader).mockReturnValue('token-valido')
  vi.mocked(verifyToken).mockReturnValue(makeDecodedToken() as any)
  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario() as any)
})

describe('authMiddleware', () => {
  describe('extração do token', () => {
    it('deve extrair token do header authorization', async () => {
      const req = makeReq()

      await authMiddleware(req, makeRes(), makeNext())

      expect(extractTokenFromHeader).toHaveBeenCalledWith('Bearer token-valido')
    })

    it('deve retornar 401 quando token não fornecido', async () => {
      vi.mocked(extractTokenFromHeader).mockReturnValue(null)
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' })
    })

    it('não deve chamar next quando token não fornecido', async () => {
      vi.mocked(extractTokenFromHeader).mockReturnValue(null)
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('verificação do token', () => {
    it('deve verificar token como access', async () => {
      await authMiddleware(makeReq(), makeRes(), makeNext())

      expect(verifyToken).toHaveBeenCalledWith('token-valido', 'access')
    })

    it('deve retornar 401 quando token expirado', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('jwt expired')
      })
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' })
    })

    it('deve retornar 401 quando token inválido (erro genérico)', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('invalid signature')
      })
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' })
    })

    it('deve retornar 401 quando erro não é instância de Error', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw 'erro desconhecido'
      })
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' })
    })

    it('deve logar erro quando exceção for lançada', async () => {
      const err = new Error('invalid signature')
      vi.mocked(verifyToken).mockImplementation(() => { throw err })

      await authMiddleware(makeReq(), makeRes(), makeNext())

      expect(logger.error).toHaveBeenCalledWith({ err }, 'authMiddleware error')
    })

    it('deve retornar 401 quando decoded não contém id', async () => {
      vi.mocked(verifyToken).mockReturnValue(makeDecodedToken({ id: undefined }) as any)
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido: ID do usuário ausente.' })
    })
  })

  describe('verificação de blacklist no Redis', () => {
    it('deve verificar blacklist quando token tem jti', async () => {
      await authMiddleware(makeReq(), makeRes(), makeNext())

      expect(cacheGet).toHaveBeenCalledWith('jwt:blacklist:jti-uuid-abc123')
    })

    it('não deve verificar blacklist quando token não tem jti', async () => {
      vi.mocked(verifyToken).mockReturnValue(makeDecodedToken({ jti: undefined }) as any)

      await authMiddleware(makeReq(), makeRes(), makeNext())

      expect(cacheGet).not.toHaveBeenCalled()
    })

    it('deve retornar 401 quando token está na blacklist', async () => {
      vi.mocked(cacheGet).mockResolvedValue('1')
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token revogado. Faça login novamente.' })
    })

    it('não deve chamar next quando token está na blacklist', async () => {
      vi.mocked(cacheGet).mockResolvedValue('1')
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).not.toHaveBeenCalled()
    })

    it('deve continuar quando token não está na blacklist', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null)
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('busca do usuário no banco', () => {
    it('deve buscar usuário com filtros corretos', async () => {
      await authMiddleware(makeReq(), makeRes(), makeNext())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123', ativo: true, deletadoEm: null },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
        },
      })
    })

    it('deve retornar 401 quando usuário não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado ou inativo.' })
    })

    it('não deve chamar next quando usuário não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).not.toHaveBeenCalled()
    })

    it('não deve selecionar password na busca', async () => {
      await authMiddleware(makeReq(), makeRes(), makeNext())

      const [args] = vi.mocked(prisma.usuario.findUnique).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken na busca', async () => {
      await authMiddleware(makeReq(), makeRes(), makeNext())

      const [args] = vi.mocked(prisma.usuario.findUnique).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('injeção do usuário na requisição', () => {
    it('deve injetar usuário em req.usuario', async () => {
      const usuario = makeUsuario()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(usuario as any)
      const req = makeReq()

      await authMiddleware(req, makeRes(), makeNext())

      expect(req.usuario).toEqual(usuario)
    })

    it('deve chamar next após injetar usuário', async () => {
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('não deve chamar next com argumentos', async () => {
      const next = makeNext()

      await authMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalledWith()
    })
  })

  describe('detecção de token expirado', () => {
    it('deve detectar "expired" no erro (case insensitive)', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('Token Expired')
      })
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' })
    })

    it('deve detectar "expir" no erro em português', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('token expirado')
      })
      const res = makeRes()

      await authMiddleware(makeReq(), res, makeNext())

      expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' })
    })
  })
})

describe('authorizeRoles', () => {
  describe('sem usuário na requisição', () => {
    it('deve retornar 401 quando req.usuario não está definido', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const req = makeReq({ usuario: undefined })
      const res = makeRes()

      middleware(req, res, makeNext())

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado.' })
    })

    it('não deve chamar next quando req.usuario não está definido', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const next = makeNext()

      middleware(makeReq({ usuario: undefined }), makeRes(), next)

      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('verificação de regras', () => {
    it('deve retornar 403 quando usuário não tem a regra necessária', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'TECNICO' as Regra }) })
      const res = makeRes()

      middleware(req, res, makeNext())

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' })
    })

    it('não deve chamar next quando regra não permitida', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'TECNICO' as Regra }) })
      const next = makeNext()

      middleware(req, makeRes(), next)

      expect(next).not.toHaveBeenCalled()
    })

    it('deve chamar next quando usuário tem a regra correta', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'ADMIN' as Regra }) })
      const next = makeNext()

      middleware(req, makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('deve aceitar múltiplas regras e chamar next quando usuário tem uma delas', () => {
      const middleware = authorizeRoles('ADMIN' as Regra, 'TECNICO' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'TECNICO' as Regra }) })
      const next = makeNext()

      middleware(req, makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('deve negar acesso quando nenhuma das regras permitidas bate', () => {
      const middleware = authorizeRoles('ADMIN' as Regra, 'TECNICO' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'USUARIO' as Regra }) })
      const res = makeRes()

      middleware(req, res, makeNext())

      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('deve permitir acesso quando lista tem uma única regra e usuário bate', () => {
      const middleware = authorizeRoles('USUARIO' as Regra)
      const req = makeReq({ usuario: makeUsuario({ regra: 'USUARIO' as Regra }) })
      const next = makeNext()

      middleware(req, makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno do middleware de autorização', () => {
    it('deve retornar uma função middleware', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)

      expect(typeof middleware).toBe('function')
    })

    it('middleware deve aceitar req, res, next como argumentos', () => {
      const middleware = authorizeRoles('ADMIN' as Regra)
      const req = makeReq({ usuario: makeUsuario() })
      const next = makeNext()

      expect(() => middleware(req, makeRes(), next)).not.toThrow()
    })
  })
})