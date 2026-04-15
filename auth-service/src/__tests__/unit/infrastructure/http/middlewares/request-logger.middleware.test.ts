import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Request, Response, NextFunction } from 'express'

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockImplementation(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('uuid-1234-5678'),
}))

import { requestLoggerMiddleware } from '../../../../../infrastructure/http/middlewares/request-logger.middleware'
import { logger } from '../../../../../shared/config/logger'

function makeRes(statusCode = 200): Response & EventEmitter {
  const emitter = new EventEmitter()
  const originalJson = vi.fn().mockReturnThis()

  const res = Object.assign(emitter, {
    statusCode,
    json: originalJson,
    setHeader: vi.fn(),
  }) as unknown as Response & EventEmitter

  return res
}

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    path: '/api/test',
    url: '/api/test',
    method: 'GET',
    headers: {},
    query: {},
    params: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as Request)

const makeNext = (): NextFunction => vi.fn()

/** Executa o middleware e retorna o child logger criado */
function runAndGetChildLogger(req: Request, res: Response & EventEmitter): ReturnType<typeof vi.fn> & {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
} {
  const childLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  vi.mocked(logger.child).mockReturnValueOnce(childLogger as any)
  requestLoggerMiddleware(req, res, makeNext())
  return childLogger as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestLoggerMiddleware', () => {
  describe('skip de paths de infraestrutura', () => {
    const skipPaths = ['/health', '/health/live', '/health/ready', '/metrics', '/favicon.ico']

    for (const path of skipPaths) {
      it(`deve chamar next sem logar para ${path}`, () => {
        const req = makeReq({ path })
        const next = makeNext()

        requestLoggerMiddleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(logger.child).not.toHaveBeenCalled()
      })
    }

    it('deve processar paths normais', () => {
      requestLoggerMiddleware(makeReq({ path: '/api/usuarios' }), makeRes(), makeNext())
      expect(logger.child).toHaveBeenCalled()
    })
  })

  describe('correlation e request IDs', () => {
    it('deve setar X-Request-ID no header da resposta', () => {
      const res = makeRes()
      requestLoggerMiddleware(makeReq(), res, makeNext())
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String))
    })

    it('deve setar X-Correlation-ID no header da resposta', () => {
      const res = makeRes()
      requestLoggerMiddleware(makeReq(), res, makeNext())
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', expect.any(String))
    })

    it('deve reutilizar x-correlation-id existente do request', () => {
      const req = makeReq({ headers: { 'x-correlation-id': 'existing-corr-id' } })
      const res = makeRes()

      requestLoggerMiddleware(req, res, makeNext())

      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'existing-corr-id')
    })

    it('deve reutilizar x-request-id quando x-correlation-id ausente', () => {
      const req = makeReq({ headers: { 'x-request-id': 'existing-req-id' } })
      const res = makeRes()

      requestLoggerMiddleware(req, res, makeNext())

      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'existing-req-id')
    })

    it('deve definir req.id com o requestId', () => {
      const req = makeReq() as Request & { id?: string }
      requestLoggerMiddleware(req, makeRes(), makeNext())
      expect(req.id).toBeDefined()
    })
  })

  describe('child logger', () => {
    it('deve criar child logger com requestId e correlationId', () => {
      requestLoggerMiddleware(makeReq(), makeRes(), makeNext())
      expect(logger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.any(String),
          correlationId: expect.any(String),
        })
      )
    })

    it('deve atribuir child logger ao req.log', () => {
      const req = makeReq() as Request & { log?: unknown }
      requestLoggerMiddleware(req, makeRes(), makeNext())
      expect(req.log).toBeDefined()
    })

    it('deve incluir userId no child logger quando usuário autenticado', () => {
      const req = makeReq({ usuario: { id: 'user-123' } })
      requestLoggerMiddleware(req, makeRes(), makeNext())
      expect(logger.child).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' })
      )
    })

    it('não deve incluir userId quando usuário não autenticado', () => {
      requestLoggerMiddleware(makeReq(), makeRes(), makeNext())
      const childCall = vi.mocked(logger.child).mock.calls[0]?.[0] as Record<string, unknown>
      expect(childCall).not.toHaveProperty('userId')
    })
  })

  describe('log de entrada da requisição', () => {
    it('deve logar info com método e url na entrada', () => {
      const req = makeReq({ method: 'GET', url: '/api/test', path: '/api/test' })
      const cl = runAndGetChildLogger(req, makeRes())

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', url: '/api/test' }),
        '→ Incoming request'
      )
    })

    it('deve incluir ip do x-forwarded-for no log', () => {
      const req = makeReq({ headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' } })
      const cl = runAndGetChildLogger(req, makeRes())

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '10.0.0.1' }),
        '→ Incoming request'
      )
    })

    it('deve usar x-real-ip como fallback', () => {
      const req = makeReq({ headers: { 'x-real-ip': '5.6.7.8' } })
      const cl = runAndGetChildLogger(req, makeRes())

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '5.6.7.8' }),
        '→ Incoming request'
      )
    })

    it('deve usar remoteAddress como último fallback', () => {
      const req = makeReq({ headers: {}, socket: { remoteAddress: '1.2.3.4' } })
      const cl = runAndGetChildLogger(req, makeRes())

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '1.2.3.4' }),
        '→ Incoming request'
      )
    })

    it('deve incluir body sanitizado em requisições POST', () => {
      const req = makeReq({ method: 'POST', body: { email: 'a@b.com', password: 'secreto' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?.password).toBe('[REDACTED]')
      expect(callArg?.body?.email).toBe('a@b.com')
    })

    it('não deve incluir body em requisições GET', () => {
      const req = makeReq({ method: 'GET', body: { data: 'algo' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body).toBeUndefined()
    })

    it('deve incluir body em requisições PATCH', () => {
      const req = makeReq({ method: 'PATCH', body: { nome: 'Diego' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body).toBeDefined()
    })

    it('deve incluir body em requisições PUT', () => {
      const req = makeReq({ method: 'PUT', body: { status: 'ativo' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body).toBeDefined()
    })

    it('deve incluir query params quando presentes', () => {
      const req = makeReq({ query: { page: '1', limit: '10' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.query).toEqual({ page: '1', limit: '10' })
    })

    it('não deve incluir query quando vazio', () => {
      const cl = runAndGetChildLogger(makeReq({ query: {} }), makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.query).toBeUndefined()
    })

    it('deve incluir params quando presentes', () => {
      const req = makeReq({ params: { id: 'abc-123' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.params).toEqual({ id: 'abc-123' })
    })
  })

  describe('sanitização do body', () => {
    it('deve redimir campo senha', () => {
      const req = makeReq({ method: 'POST', body: { senha: 'minha-senha' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?.senha).toBe('[REDACTED]')
    })

    it('deve redimir campo token', () => {
      const req = makeReq({ method: 'POST', body: { token: 'my-token' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?.token).toBe('[REDACTED]')
    })

    it('deve redimir campo cpf', () => {
      const req = makeReq({ method: 'POST', body: { cpf: '123.456.789-00' } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?.cpf).toBe('[REDACTED]')
    })

    it('deve retornar undefined para body null', () => {
      const req = makeReq({ method: 'POST', body: null })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body).toBeUndefined()
    })

    it('deve truncar body muito grande', () => {
      const req = makeReq({ method: 'POST', body: { data: 'x'.repeat(3000) } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?._truncated).toBe(true)
    })

    it('deve redimir campos sensíveis em objetos aninhados', () => {
      const req = makeReq({ method: 'POST', body: { user: { password: 'sec', nome: 'Diego' } } })
      const cl = runAndGetChildLogger(req, makeRes())

      const callArg = cl.info.mock.calls[0]?.[0] as Record<string, any>
      expect(callArg?.body?.user?.password).toBe('[REDACTED]')
      expect(callArg?.body?.user?.nome).toBe('Diego')
    })
  })

  describe('log de saída via res.json', () => {
    it('deve logar resposta 2xx com nível info', () => {
      const res = makeRes(200)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.json({ ok: true })

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 200, duration: expect.any(Number) }),
        expect.stringContaining('← Request completed')
      )
    })

    it('deve logar warn para respostas 4xx', () => {
      const res = makeRes(404)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.json({ error: 'Not found' })

      expect(cl.warn).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
        expect.stringContaining('← Request completed')
      )
    })

    it('deve logar error para respostas 5xx', () => {
      const res = makeRes(500)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.json({ error: 'Internal Server Error' })

      expect(cl.error).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
        expect.stringContaining('← Request completed')
      )
    })

    it('não deve lançar exceção ao chamar res.json', () => {
      const res = makeRes(200)
      runAndGetChildLogger(makeReq(), res)

      expect(() => res.json({ data: 'test' })).not.toThrow()
    })
  })

  describe('log de saída via res.on("finish")', () => {
    it('deve logar quando finish dispara sem res.json', () => {
      const res = makeRes(200)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.emit('finish')

      expect(cl.info).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 200 }),
        expect.stringContaining('← Request finished')
      )
    })

    it('não deve duplicar log quando res.json foi chamado antes do finish', () => {
      const res = makeRes(200)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.json({ ok: true })
      cl.info.mockClear()

      res.emit('finish')

      const finishLogs = cl.info.mock.calls.filter(
        (call: unknown[]) => String(call[1]).includes('← Request finished')
      )
      expect(finishLogs).toHaveLength(0)
    })

    it('deve usar nível warn para finish com status 4xx', () => {
      const res = makeRes(400)
      const cl = runAndGetChildLogger(makeReq(), res)

      res.emit('finish')

      expect(cl.warn).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
        expect.stringContaining('← Request finished')
      )
    })
  })

  describe('detecção de requisições lentas', () => {
    it('deve logar warning para requisições acima do threshold', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)
        .mockReturnValue(now + 3000)

      const res = makeRes(200)
      const cl = runAndGetChildLogger(makeReq(), res)
      res.emit('finish')

      expect(cl.warn).toHaveBeenCalledWith(
        expect.objectContaining({ duration: expect.any(Number), threshold: 2000 }),
        '[PERFORMANCE] Requisição lenta detectada'
      )

      vi.restoreAllMocks()
    })

    it('não deve logar performance warning para requisições rápidas', () => {
      const res = makeRes(200)
      const cl = runAndGetChildLogger(makeReq(), res)
      res.emit('finish')

      const slowLogs = cl.warn.mock.calls.filter(
        (call: unknown[]) => String(call[1]).includes('[PERFORMANCE]')
      )
      expect(slowLogs).toHaveLength(0)
    })
  })

  describe('chamada do next', () => {
    it('deve chamar next exatamente uma vez para paths normais', () => {
      const next = makeNext()
      requestLoggerMiddleware(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledTimes(1)
    })

    it('deve chamar next para paths de skip', () => {
      const next = makeNext()
      requestLoggerMiddleware(makeReq({ path: '/health' }), makeRes(), next)
      expect(next).toHaveBeenCalledTimes(1)
    })
  })
})
