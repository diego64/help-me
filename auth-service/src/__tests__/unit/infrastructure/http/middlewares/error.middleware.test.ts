import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

import {
  errorLoggerMiddleware,
  errorResponseMiddleware,
  requestTimingMiddleware,
  correlationIdMiddleware,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServiceUnavailableError,
  OperationalError,
  type AppError,
} from '../../../../../infrastructure/http/middlewares/error.middleware'

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}))

const makeReq = (overrides = {}): Request => ({
  headers: {},
  method: 'GET',
  originalUrl: '/test',
  url: '/test',
  path: '/test',
  query: {},
  params: {},
  body: {},
  socket: { remoteAddress: '127.0.0.1' },
  get: vi.fn().mockReturnValue(undefined),
  log: undefined,
  ...overrides,
} as unknown as Request)

const makeRes = (): Response => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  headersSent: false,
} as unknown as Response)

const makeNext = (): NextFunction => vi.fn()

const makeError = (overrides: Partial<AppError> = {}): AppError => {
  const err = new Error('Erro de teste') as AppError
  err.status = 500
  err.isOperational = true
  Object.assign(err, overrides)
  return err
}

const getLoggerMock = async () => {
  const mod = await import('../../../../../shared/config/logger')
  return mod.logger as unknown as Record<string, ReturnType<typeof vi.fn>>
}

const getFirstCallArg = (mockFn: ReturnType<typeof vi.fn>) =>
  mockFn.mock.calls[0]?.[0] as Record<string, any>

describe('error.middleware', () => {
  describe('errorLoggerMiddleware', () => {
    let loggerMock: Record<string, ReturnType<typeof vi.fn>>

    beforeEach(async () => {
      loggerMock = await getLoggerMock()
      vi.clearAllMocks()
    })

    describe('severidade de logging', () => {
      it('deve logar como fatal para erro 5xx', () => {
        errorLoggerMiddleware(makeError({ status: 500 }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.fatal).toHaveBeenCalled()
      })

      it('deve logar como fatal para erro 503', () => {
        errorLoggerMiddleware(makeError({ status: 503 }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.fatal).toHaveBeenCalled()
      })

      it('deve logar como warn para erro 400', () => {
        errorLoggerMiddleware(makeError({ status: 400 }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.warn).toHaveBeenCalled()
      })

      it('deve logar como warn para erro 404', () => {
        errorLoggerMiddleware(makeError({ status: 404 }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.warn).toHaveBeenCalled()
      })

      it('deve logar como fatal quando isOperational=false mesmo com status 400', () => {
        errorLoggerMiddleware(makeError({ status: 400, isOperational: false }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.fatal).toHaveBeenCalled()
      })

      it('deve logar como error para status codes fora de 4xx e 5xx', () => {
        errorLoggerMiddleware(makeError({ status: 302 }), makeReq(), makeRes(), makeNext())
        expect(loggerMock.error).toHaveBeenCalled()
      })
    })

    describe('correlation ID', () => {
      it('deve usar x-correlation-id do header', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { 'x-correlation-id': 'corr-id-abc' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(err.requestId).toBe('corr-id-abc')
      })

      it('deve usar x-request-id como fallback quando x-correlation-id ausente', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { 'x-request-id': 'req-id-xyz' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(err.requestId).toBe('req-id-xyz')
      })

      it('deve gerar correlation ID quando nenhum header presente', () => {
        const err = makeError({ status: 400 })

        errorLoggerMiddleware(err, makeReq(), makeRes(), makeNext())

        expect(err.requestId).toBeDefined()
        expect(typeof err.requestId).toBe('string')
        expect(err.requestId!.length).toBeGreaterThan(0)
      })

      it('deve adicionar timestamp ISO ao erro', () => {
        const err = makeError({ status: 400 })

        errorLoggerMiddleware(err, makeReq(), makeRes(), makeNext())

        expect(err.timestamp).toBeDefined()
        expect(() => new Date(err.timestamp!)).not.toThrow()
        expect(new Date(err.timestamp!).toISOString()).toBe(err.timestamp)
      })
    })

    describe('uso do logger da requisição', () => {
      it('deve usar req.log quando disponível em vez do logger global', () => {
        const reqLog = { fatal: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }
        const err = makeError({ status: 400 })
        const req = makeReq({ log: reqLog })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(reqLog.warn).toHaveBeenCalled()
        expect(loggerMock.warn).not.toHaveBeenCalled()
      })
    })

    describe('extração de IP', () => {
      it('deve usar x-forwarded-for como IP prioritário', () => {
        const req = makeReq({ headers: { 'x-forwarded-for': '192.168.1.1' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.ip).toBe('192.168.1.1')
      })

      it('deve usar x-real-ip como segundo fallback', () => {
        const req = makeReq({
          headers: { 'x-real-ip': '10.0.0.5' },
          socket: { remoteAddress: undefined },
        })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.ip).toBe('10.0.0.5')
      })

      it('deve usar remoteAddress como último fallback', () => {
        const req = makeReq({
          headers: {},
          socket: { remoteAddress: '10.0.0.1' },
        })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.ip).toBe('10.0.0.1')
      })
    })

    describe('sanitização do body', () => {
      it('deve redimir campo password', () => {
        const req = makeReq({ body: { email: 'a@b.com', password: 'segredo123' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.body?.password).toBe('[REDACTED]')
      })

      it('deve manter campo não sensível', () => {
        const req = makeReq({ body: { email: 'diego@email.com', nome: 'Diego' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.body?.email).toBe('diego@email.com')
        expect(arg?.request?.body?.nome).toBe('Diego')
      })

      it('deve redimir token no body', () => {
        const req = makeReq({ body: { token: 'meu-token' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.body?.token).toBe('[REDACTED]')
      })

      it('deve truncar body maior que 10000 caracteres', () => {
        const req = makeReq({ body: { data: 'x'.repeat(15000) } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.body?._truncated).toBe(true)
        expect(arg?.request?.body?._originalSize).toBeGreaterThan(10000)
      })
    })

    describe('sanitização de headers', () => {
      it('deve redimir token do authorization mas preservar o tipo', () => {
        const req = makeReq({ headers: { authorization: 'Bearer meu-token-secreto' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.headers?.authorization).toBe('Bearer [REDACTED]')
      })

      it('deve preservar x-correlation-id nos headers', () => {
        const req = makeReq({ headers: { 'x-correlation-id': 'corr-123' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.headers?.['x-correlation-id']).toBe('corr-123')
      })

      it('deve incluir content-type nos headers', () => {
        const req = makeReq({ headers: { 'content-type': 'application/json' } })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.headers?.['content-type']).toBe('application/json')
      })
    })

    describe('sanitização de URL', () => {
      it('não deve expor valor real do token na URL', () => {
        const req = makeReq({ originalUrl: '/reset?token=meu-token-secreto' })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.url).not.toContain('meu-token-secreto')
      })

      it('não deve expor valor real de password na URL', () => {
        const req = makeReq({ originalUrl: '/login?password=senha123' })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.url).not.toContain('senha123')
      })

      it('deve preservar path sem query string sensível', () => {
        const req = makeReq({ originalUrl: '/api/usuarios?page=1' })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.request?.url).toContain('/api/usuarios')
        expect(arg?.request?.url).toContain('page=1')
      })
    })

    describe('contexto do usuário', () => {
      it('deve incluir id, email e regra quando usuário autenticado', () => {
        const req = makeReq({
          usuario: { id: 'u1', email: 'diego@email.com', regra: 'ADMIN', nome: 'Diego', sobrenome: 'Dev' },
        })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.usuario).toEqual({ id: 'u1', email: 'diego@email.com', regra: 'ADMIN' })
      })

      it('não deve incluir nome e sobrenome no contexto do usuário', () => {
        const req = makeReq({
          usuario: { id: 'u1', email: 'a@b.com', regra: 'TECNICO', nome: 'Diego', sobrenome: 'Dev' },
        })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.usuario).not.toHaveProperty('nome')
        expect(arg?.usuario).not.toHaveProperty('sobrenome')
      })

      it('deve retornar undefined no contexto quando não autenticado', () => {
        errorLoggerMiddleware(makeError({ status: 400 }), makeReq(), makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.usuario).toBeUndefined()
      })
    })

    describe('duração da requisição', () => {
      it('deve calcular duração quando startTime definido', () => {
        const req = makeReq({ startTime: Date.now() - 100 })

        errorLoggerMiddleware(makeError({ status: 400 }), req, makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.timing?.duration).toBeGreaterThanOrEqual(0)
        expect(typeof arg?.timing?.duration).toBe('number')
      })

      it('deve retornar undefined para duração quando startTime não definido', () => {
        errorLoggerMiddleware(makeError({ status: 400 }), makeReq(), makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.timing?.duration).toBeUndefined()
      })
    })

    describe('metadados do contexto', () => {
      it('deve incluir service auth-service', () => {
        errorLoggerMiddleware(makeError({ status: 400 }), makeReq(), makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.service).toBe('auth-service')
      })

      it('deve incluir environment', () => {
        errorLoggerMiddleware(makeError({ status: 400 }), makeReq(), makeRes(), makeNext())

        const arg = getFirstCallArg(loggerMock.warn!)
        expect(arg?.environment).toBeDefined()
      })
    })

    describe('passagem para próximo handler', () => {
      it('deve chamar next com o erro', () => {
        const err = makeError({ status: 400 })
        const next = makeNext()

        errorLoggerMiddleware(err, makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(err)
      })

      it('deve sempre chamar next independente do status', () => {
        const next = makeNext()

        errorLoggerMiddleware(makeError({ status: 500 }), makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
      })
    })
  })

  // ─── errorResponseMiddleware ────────────────────────────────────────────────

  describe('errorResponseMiddleware', () => {

    describe('status codes', () => {
      it('deve usar err.status', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 404 }), makeReq(), res, makeNext())
        expect(res.status).toHaveBeenCalledWith(404)
      })

      it('deve usar err.statusCode como fallback', () => {
        const err = new Error('teste') as AppError
        err.statusCode = 422
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(422)
      })

      it('deve usar 500 quando status não definido', () => {
        const err = new Error('teste') as AppError
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(500)
      })
    })

    describe('estrutura RFC 7807', () => {
      it('deve retornar todos os campos obrigatórios', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 400, message: 'Dados inválidos' }), makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            type: expect.any(String),
            title: expect.any(String),
            status: 400,
            detail: 'Dados inválidos',
            instance: expect.any(String),
            timestamp: expect.any(String),
          })
        )
      })

      it('deve mapear 400 → Bad Request', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 400 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          type: 'https://helpme.com/errors/bad-request',
          title: 'Bad Request',
        }))
      })

      it('deve mapear 401 → Unauthorized', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 401 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unauthorized' }))
      })

      it('deve mapear 403 → Forbidden', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 403 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Forbidden' }))
      })

      it('deve mapear 404 → Not Found', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 404 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not Found' }))
      })

      it('deve mapear 409 → Conflict', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 409 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conflict' }))
      })

      it('deve mapear 422 → Validation Error', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 422 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Error' }))
      })

      it('deve mapear 429 → Too Many Requests', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 429 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Too Many Requests' }))
      })

      it('deve mapear 500 → Internal Server Error', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 500 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Internal Server Error' }))
      })

      it('deve mapear 503 → Service Unavailable', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 503 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Service Unavailable' }))
      })

      it('deve mapear status desconhecido → Error', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 418 }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error' }))
      })
    })

    describe('requestId e header', () => {
      it('deve incluir requestId na resposta', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 400, requestId: 'req-id-123' }), makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-id-123' }))
      })

      it('deve setar header X-Request-ID', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 400, requestId: 'req-id-123' }), makeReq(), res, makeNext())
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-id-123')
      })

      it('não deve setar header quando requestId ausente', () => {
        const res = makeRes()
        errorResponseMiddleware(makeError({ status: 400 }), makeReq(), res, makeNext())
        expect(res.setHeader).not.toHaveBeenCalledWith('X-Request-ID', expect.anything())
      })

      it('deve incluir code quando definido no erro', () => {
        const err = makeError({ status: 400 }) as AppError & { code: string }
        err.code = 'MEU_CODIGO'
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MEU_CODIGO' }))
      })
    })

    describe('erros de validação', () => {
      it('deve expor errors quando details.errors presente', () => {
        const err = makeError({ status: 422, details: { errors: ['Campo obrigatório'] } })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ errors: ['Campo obrigatório'] })
        )
      })

      it('não deve expor errors quando details.errors ausente', () => {
        const err = makeError({ status: 422 })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        const chamada = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>
        expect(chamada).not.toHaveProperty('errors')
      })
    })

    describe('exposição por ambiente', () => {
      const originalEnv = process.env.NODE_ENV

      afterEach(() => { process.env.NODE_ENV = originalEnv })

      it('deve incluir stack em desenvolvimento', () => {
        process.env.NODE_ENV = 'development'
        const err = makeError({ status: 500 })
        err.stack = 'Error: test\n  at test.js:1'
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ stack: expect.any(String) }))
      })

      it('deve incluir details em desenvolvimento', () => {
        process.env.NODE_ENV = 'development'
        const err = makeError({ status: 500, details: { info: 'extra' } })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ details: expect.any(Object) }))
      })

      it('não deve incluir stack em produção', () => {
        process.env.NODE_ENV = 'production'
        const err = makeError({ status: 500 })
        err.stack = 'Error: test\n  at test.js:1'
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        const chamada = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>
        expect(chamada).not.toHaveProperty('stack')
      })

      it('não deve incluir details em produção', () => {
        process.env.NODE_ENV = 'production'
        const err = makeError({ status: 500, details: { info: 'extra' } })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        const chamada = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>
        expect(chamada).not.toHaveProperty('details')
      })
    })

    describe('headers já enviados', () => {
      it('deve chamar next com erro quando headersSent=true', () => {
        const err = makeError({ status: 500 })
        const res = { ...makeRes(), headersSent: true } as unknown as Response
        const next = makeNext()

        errorResponseMiddleware(err, makeReq(), res, next)

        expect(next).toHaveBeenCalledWith(err)
      })

      it('não deve chamar json quando headersSent=true', () => {
        const res = makeRes();
        (res as any).headersSent = true

        errorResponseMiddleware(makeError({ status: 500 }), makeReq(), res, makeNext())

        expect(res.json).not.toHaveBeenCalled()
      })
    })
  })

  // ─── requestTimingMiddleware ────────────────────────────────────────────────

  describe('requestTimingMiddleware', () => {
    it('deve adicionar startTime à requisição', () => {
      const req = makeReq() as Request & { startTime?: number }
      const before = Date.now()

      requestTimingMiddleware(req, makeRes(), makeNext())

      expect(req.startTime).toBeGreaterThanOrEqual(before)
      expect(req.startTime).toBeLessThanOrEqual(Date.now())
    })

    it('deve chamar next sem argumentos', () => {
      const next = makeNext()
      requestTimingMiddleware(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledWith()
    })

    it('deve chamar next exatamente uma vez', () => {
      const next = makeNext()
      requestTimingMiddleware(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('correlationIdMiddleware', () => {
    it('deve preservar x-correlation-id existente', () => {
      const req = makeReq({ headers: { 'x-correlation-id': 'existing-corr-id' } })
      correlationIdMiddleware(req, makeRes(), makeNext())
      expect(req.headers['x-correlation-id']).toBe('existing-corr-id')
    })

    it('deve usar x-request-id como fallback', () => {
      const req = makeReq({ headers: { 'x-request-id': 'existing-req-id' } })
      correlationIdMiddleware(req, makeRes(), makeNext())
      expect(req.headers['x-correlation-id']).toBe('existing-req-id')
    })

    it('deve gerar novo correlation ID quando nenhum header presente', () => {
      const req = makeReq({ headers: {} })
      correlationIdMiddleware(req, makeRes(), makeNext())
      expect(req.headers['x-correlation-id']).toBeDefined()
      expect(typeof req.headers['x-correlation-id']).toBe('string')
    })

    it('deve setar header X-Correlation-ID na resposta', () => {
      const req = makeReq({ headers: { 'x-correlation-id': 'corr-id-abc' } })
      const res = makeRes()
      correlationIdMiddleware(req, res, makeNext())
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'corr-id-abc')
    })

    it('deve adicionar x-correlation-id ao header da req para propagação', () => {
      const req = makeReq({ headers: {} })
      correlationIdMiddleware(req, makeRes(), makeNext())
      expect(req.headers['x-correlation-id']).toBeDefined()
    })

    it('deve chamar next uma vez', () => {
      const next = makeNext()
      correlationIdMiddleware(makeReq(), makeRes(), next)
      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('OperationalError', () => {
    it('deve ter isOperational=true', () => {
      expect(new OperationalError('teste', 500).isOperational).toBe(true)
    })

    it('deve ter statusCode correto', () => {
      expect(new OperationalError('teste', 422).statusCode).toBe(422)
    })

    it('deve usar 500 como statusCode padrão', () => {
      expect(new OperationalError('teste').statusCode).toBe(500)
    })

    it('deve setar code quando fornecido', () => {
      expect(new OperationalError('teste', 400, 'MEU_CODIGO').code).toBe('MEU_CODIGO')
    })

    it('deve setar details quando fornecido', () => {
      expect(new OperationalError('teste', 400, undefined, { campo: 'valor' }).details).toEqual({ campo: 'valor' })
    })

    it('deve setar timestamp como ISO string', () => {
      const err = new OperationalError('teste')
      expect(() => new Date(err.timestamp)).not.toThrow()
    })

    it('deve setar name como nome da classe', () => {
      expect(new OperationalError('teste').name).toBe('OperationalError')
    })

    it('deve ter stack trace', () => {
      expect(new OperationalError('teste').stack).toBeDefined()
    })
  })

  describe('BadRequestError', () => {
    it('deve ter statusCode 400', () => { expect(new BadRequestError().statusCode).toBe(400) })
    it('deve ter code BAD_REQUEST', () => { expect(new BadRequestError().code).toBe('BAD_REQUEST') })
    it('deve usar mensagem padrão "Bad Request"', () => { expect(new BadRequestError().message).toBe('Bad Request') })
    it('deve aceitar mensagem personalizada', () => { expect(new BadRequestError('Campo inválido').message).toBe('Campo inválido') })
    it('deve aceitar details', () => { expect(new BadRequestError('msg', { campo: 'nome' }).details).toEqual({ campo: 'nome' }) })
  })

  describe('UnauthorizedError', () => {
    it('deve ter statusCode 401', () => { expect(new UnauthorizedError().statusCode).toBe(401) })
    it('deve ter code UNAUTHORIZED', () => { expect(new UnauthorizedError().code).toBe('UNAUTHORIZED') })
    it('deve usar mensagem padrão "Unauthorized"', () => { expect(new UnauthorizedError().message).toBe('Unauthorized') })
  })

  describe('ForbiddenError', () => {
    it('deve ter statusCode 403', () => { expect(new ForbiddenError().statusCode).toBe(403) })
    it('deve ter code FORBIDDEN', () => { expect(new ForbiddenError().code).toBe('FORBIDDEN') })
    it('deve usar mensagem padrão "Forbidden"', () => { expect(new ForbiddenError().message).toBe('Forbidden') })
  })

  describe('NotFoundError', () => {
    it('deve ter statusCode 404', () => { expect(new NotFoundError().statusCode).toBe(404) })
    it('deve ter code NOT_FOUND', () => { expect(new NotFoundError().code).toBe('NOT_FOUND') })
    it('deve usar mensagem padrão "Not Found"', () => { expect(new NotFoundError().message).toBe('Not Found') })
  })

  describe('ConflictError', () => {
    it('deve ter statusCode 409', () => { expect(new ConflictError().statusCode).toBe(409) })
    it('deve ter code CONFLICT', () => { expect(new ConflictError().code).toBe('CONFLICT') })
    it('deve usar mensagem padrão "Conflict"', () => { expect(new ConflictError().message).toBe('Conflict') })
  })

  describe('ValidationError', () => {
    it('deve ter statusCode 422', () => { expect(new ValidationError().statusCode).toBe(422) })
    it('deve ter code VALIDATION_ERROR', () => { expect(new ValidationError().code).toBe('VALIDATION_ERROR') })
    it('deve usar mensagem padrão "Validation Error"', () => { expect(new ValidationError().message).toBe('Validation Error') })
    it('deve aceitar details com erros de validação', () => {
      expect(new ValidationError('Inválido', { erros: ['Campo obrigatório'] }).details).toEqual({ erros: ['Campo obrigatório'] })
    })
  })

  describe('RateLimitError', () => {
    it('deve ter statusCode 429', () => { expect(new RateLimitError().statusCode).toBe(429) })
    it('deve ter code RATE_LIMIT_EXCEEDED', () => { expect(new RateLimitError().code).toBe('RATE_LIMIT_EXCEEDED') })
    it('deve usar mensagem padrão "Too Many Requests"', () => { expect(new RateLimitError().message).toBe('Too Many Requests') })
  })

  describe('ServiceUnavailableError', () => {
    it('deve ter statusCode 503', () => { expect(new ServiceUnavailableError().statusCode).toBe(503) })
    it('deve ter code SERVICE_UNAVAILABLE', () => { expect(new ServiceUnavailableError().code).toBe('SERVICE_UNAVAILABLE') })
    it('deve usar mensagem padrão "Service Unavailable"', () => { expect(new ServiceUnavailableError().message).toBe('Service Unavailable') })
  })

  describe('herança de classes de erro', () => {
    it('todas as classes devem ser instâncias de OperationalError', () => {
      const erros = [
        new BadRequestError(),
        new UnauthorizedError(),
        new ForbiddenError(),
        new NotFoundError(),
        new ConflictError(),
        new ValidationError(),
        new RateLimitError(),
        new ServiceUnavailableError(),
      ]
      for (const err of erros) {
        expect(err).toBeInstanceOf(OperationalError)
      }
    })

    it('todas as classes devem ser instâncias de Error', () => {
      expect(new BadRequestError()).toBeInstanceOf(Error)
      expect(new NotFoundError()).toBeInstanceOf(Error)
    })

    it('todas as classes devem ter isOperational=true', () => {
      const erros = [
        new BadRequestError(),
        new UnauthorizedError(),
        new ForbiddenError(),
        new NotFoundError(),
        new ConflictError(),
        new ValidationError(),
        new RateLimitError(),
        new ServiceUnavailableError(),
      ]
      for (const err of erros) {
        expect(err.isOperational).toBe(true)
      }
    })
  })
})