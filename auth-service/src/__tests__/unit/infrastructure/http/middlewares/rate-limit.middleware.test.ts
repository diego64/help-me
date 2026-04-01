import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

import { checkProgressiveBlock } from '../../../../../infrastructure/http/middlewares/rate-limit.middleware'
import { cacheIncr, cacheExpire, cacheSet, cacheGet } from '../../../../../infrastructure/database/redis/client'
import { logger } from '../../../../../shared/config/logger'

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheIncr: vi.fn(),
  cacheExpire: vi.fn(),
  cacheSet: vi.fn(),
  cacheGet: vi.fn(),
  cacheTTL: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const makeReq = (overrides = {}): Request => ({
  headers: {},
  ip: '203.0.113.1',
  path: '/auth/login',
  body: {},
  get: vi.fn().mockReturnValue(undefined),
  app: { get: vi.fn().mockReturnValue('production') },
  ...overrides,
} as unknown as Request)

const makeRes = (): Response => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
} as unknown as Response)

const makeNext = (): NextFunction => vi.fn()

// IP externo (não confiável) para forçar execução do middleware
const EXTERNAL_IP = '203.0.113.1'

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(cacheIncr).mockResolvedValue(1)
  vi.mocked(cacheExpire).mockResolvedValue(undefined as any)
  vi.mocked(cacheSet).mockResolvedValue(undefined as any)
})

describe('rate-limit.middleware', () => {
  describe('checkProgressiveBlock', () => {
    describe('bypass por ambiente de teste', () => {
      it('deve chamar next sem verificar Redis quando env=test', async () => {
        const req = makeReq({
          app: { get: vi.fn().mockReturnValue('test') },
        })
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(cacheGet).not.toHaveBeenCalled()
      })
    })

    describe('bypass por IP confiável', () => {
      it('deve chamar next sem verificar Redis para 127.0.0.1', async () => {
        const req = makeReq({ ip: '127.0.0.1' })
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(cacheGet).not.toHaveBeenCalled()
      })

      it('deve chamar next sem verificar Redis para ::1 (IPv6 loopback)', async () => {
        const req = makeReq({ ip: '::1' })
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(cacheGet).not.toHaveBeenCalled()
      })
    })

    describe('IP não bloqueado', () => {
      it('deve chamar next quando IP não está bloqueado', async () => {
        vi.mocked(cacheGet).mockResolvedValue(null)
        const req = makeReq({ ip: EXTERNAL_IP })
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
      })

      it('deve verificar chave correta no Redis', async () => {
        const req = makeReq({ ip: EXTERNAL_IP })
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), makeNext())

        expect(cacheGet).toHaveBeenCalledWith(`rate:block:auth:${EXTERNAL_IP}`)
      })

      it('deve verificar chave com endpoint correto', async () => {
        const req = makeReq({ ip: EXTERNAL_IP })
        const middleware = await checkProgressiveBlock('register')

        await middleware(req, makeRes(), makeNext())

        expect(cacheGet).toHaveBeenCalledWith(`rate:block:register:${EXTERNAL_IP}`)
      })

      it('não deve retornar resposta 429 quando não bloqueado', async () => {
        vi.mocked(cacheGet).mockResolvedValue(null)
        const res = makeRes()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), res, makeNext())

        expect(res.status).not.toHaveBeenCalled()
      })
    })

    describe('IP bloqueado', () => {
      beforeEach(async () => {
        vi.mocked(cacheGet).mockResolvedValue('2')

        const redis = await import('../../../../../infrastructure/database/redis/client')
        vi.mocked(redis.cacheTTL).mockResolvedValue(900)
      })

      it('deve retornar 429 quando IP está bloqueado', async () => {
        const res = makeRes()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(429)
      })

      it('deve retornar mensagem de bloqueio correta', async () => {
        const res = makeRes()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'IP temporarily blocked',
            message: expect.stringContaining('temporarily blocked'),
            retryAfter: expect.any(Number),
          })
        )
      })

      it('deve incluir retryAfter com TTL do Redis', async () => {
        const res = makeRes()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), res, makeNext())

        const chamada = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>
        expect(chamada?.retryAfter).toBe(900)
      })

      it('não deve chamar next quando IP bloqueado', async () => {
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), makeRes(), next)

        expect(next).not.toHaveBeenCalled()
      })

      it('deve logar warning quando IP bloqueado', async () => {
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            ip: EXTERNAL_IP,
            endpoint: 'auth',
            blockedSeconds: expect.any(Number),
          }),
          '[SECURITY] Requisição bloqueada por violação anterior'
        )
      })
    })

    describe('extração de IP via headers', () => {
      it('deve usar x-forwarded-for quando disponível', async () => {
        vi.mocked(cacheGet).mockResolvedValue(null)
        const req = makeReq({
          headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
          ip: EXTERNAL_IP,
        })
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), makeNext())

        expect(cacheGet).toHaveBeenCalledWith('rate:block:auth:1.2.3.4')
      })

      it('deve usar x-real-ip como fallback', async () => {
        vi.mocked(cacheGet).mockResolvedValue(null)
        const req = makeReq({
          headers: { 'x-real-ip': '5.6.7.8' },
          ip: EXTERNAL_IP,
        })
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), makeNext())

        expect(cacheGet).toHaveBeenCalledWith('rate:block:auth:5.6.7.8')
      })

      it('deve normalizar IPv4-mapped IPv6 (::ffff:x.x.x.x)', async () => {
        vi.mocked(cacheGet).mockResolvedValue(null)
        const req = makeReq({
          headers: {},
          ip: '::ffff:192.168.1.1',
        })
        const middleware = await checkProgressiveBlock('auth')

        await middleware(req, makeRes(), makeNext())

        // IP normalizado para IPv4 puro
        expect(cacheGet).toHaveBeenCalledWith('rate:block:auth:192.168.1.1')
      })
    })

    describe('resiliência a falhas do Redis', () => {
      it('deve chamar next quando cacheGet falhar', async () => {
        vi.mocked(cacheGet).mockRejectedValue(new Error('Redis down'))
        const next = makeNext()
        const middleware = await checkProgressiveBlock('auth')

        await middleware(makeReq({ ip: EXTERNAL_IP }), makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
      })

      it('não deve lançar exceção quando Redis falhar', async () => {
        vi.mocked(cacheGet).mockRejectedValue(new Error('Redis down'))
        const middleware = await checkProgressiveBlock('auth')

        await expect(
          middleware(makeReq({ ip: EXTERNAL_IP }), makeRes(), makeNext())
        ).resolves.not.toThrow()
      })
    })

    describe('retorno de função middleware', () => {
      it('deve retornar uma função assíncrona', async () => {
        const middleware = await checkProgressiveBlock('auth')
        expect(typeof middleware).toBe('function')
      })

      it('deve aceitar endpoint como parâmetro', async () => {
        await expect(checkProgressiveBlock('auth')).resolves.toBeDefined()
        await expect(checkProgressiveBlock('register')).resolves.toBeDefined()
      })
    })
  })
})