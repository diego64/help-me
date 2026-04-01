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

const makeRes = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    headersSent: false,
  }
  return res as unknown as Response
}

const makeNext = (): NextFunction => vi.fn()

const makeError = (overrides: Partial<AppError> = {}): AppError => {
  const err = new Error('Erro de teste') as AppError
  err.status = 500
  err.isOperational = true
  Object.assign(err, overrides)
  return err
}

describe('error.middleware', () => {
  describe('errorLoggerMiddleware', () => {
    let logger: { fatal: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }

    beforeEach(async () => {
      const mod = await import('../../../../../shared/config/logger')
      logger = mod.logger as any
      vi.clearAllMocks()
    })

    describe('logging por severidade', () => {
      it('deve logar como fatal para erro 5xx', () => {
        const err = makeError({ status: 500 })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.fatal).toHaveBeenCalled()
      })

      it('deve logar como warn para erro 4xx', () => {
        const err = makeError({ status: 400 })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalled()
      })

      it('deve logar como fatal quando isOperational=false independente do status', () => {
        const err = makeError({ status: 400, isOperational: false })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.fatal).toHaveBeenCalled()
      })

      it('deve logar como error para outros status codes', () => {
        const err = makeError({ status: 302 })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.error).toHaveBeenCalled()
      })
    })

    describe('correlation ID', () => {
      it('deve usar x-correlation-id do header quando disponível', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { 'x-correlation-id': 'corr-id-abc' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(err.requestId).toBe('corr-id-abc')
      })

      it('deve usar x-request-id como fallback', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { 'x-request-id': 'req-id-xyz' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(err.requestId).toBe('req-id-xyz')
      })

      it('deve gerar correlation ID quando nenhum header estiver presente', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: {} })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(err.requestId).toBeDefined()
        expect(typeof err.requestId).toBe('string')
      })

      it('deve adicionar timestamp ao erro', () => {
        const err = makeError({ status: 400 })

        errorLoggerMiddleware(err, makeReq(), makeRes(), makeNext())

        expect(err.timestamp).toBeDefined()
        expect(() => new Date(err.timestamp!)).not.toThrow()
      })
    })

    describe('uso do logger da requisição', () => {
      it('deve usar req.log quando disponível', () => {
        const reqLog = { fatal: vi.fn(), warn: vi.fn(), error: vi.fn() }
        const err = makeError({ status: 400 })
        const req = makeReq({ log: reqLog })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(reqLog.warn).toHaveBeenCalled()
      })
    })

    describe('extração de IP', () => {
      it('deve usar x-forwarded-for como IP', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { 'x-forwarded-for': '192.168.1.1' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({ ip: '192.168.1.1' }),
          }),
          expect.any(String)
        )
      })

      it('deve usar remoteAddress como fallback', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({
          headers: {},
          socket: { remoteAddress: '10.0.0.1' },
        })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({ ip: '10.0.0.1' }),
          }),
          expect.any(String)
        )
      })
    })

    describe('sanitização', () => {
      it('deve redimir campo password do body', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ body: { email: 'a@b.com', password: 'segredo123' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              body: expect.objectContaining({ password: '[REDACTED]' }),
            }),
          }),
          expect.any(String)
        )
      })

      it('deve manter campo não sensível no body', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ body: { email: 'diego@email.com', password: 'x' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              body: expect.objectContaining({ email: 'diego@email.com' }),
            }),
          }),
          expect.any(String)
        )
      })

      it('deve redimir authorization header mas manter o tipo', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ headers: { authorization: 'Bearer meu-token-secreto' } })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              headers: expect.objectContaining({ authorization: 'Bearer [REDACTED]' }),
            }),
          }),
          expect.any(String)
        )
      })

      it('deve truncar body muito grande', () => {
        const err = makeError({ status: 400 })
        const largeBody = { data: 'x'.repeat(15000) }
        const req = makeReq({ body: largeBody })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              body: expect.objectContaining({ _truncated: true }),
            }),
          }),
          expect.any(String)
        )
      })

      it('deve sanitizar URL com token na query string', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ originalUrl: '/reset?token=meu-token-secreto' })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              url: expect.stringMatching(/token=/),
            }),
          }),
          expect.any(String)
        )

        const chamada = vi.mocked(logger.warn).mock.calls[0]?.[0] as any
        expect(chamada?.request?.url).not.toContain('meu-token-secreto')
      })
    })

    describe('contexto do usuário', () => {
      it('deve incluir contexto do usuário quando autenticado', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({
          usuario: { id: 'u1', email: 'a@b.com', regra: 'ADMIN', nome: 'Diego', sobrenome: 'Dev' },
        })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            usuario: { id: 'u1', email: 'a@b.com', regra: 'ADMIN' },
          }),
          expect.any(String)
        )
      })

      it('deve retornar undefined no contexto quando usuário não autenticado', () => {
        const err = makeError({ status: 400 })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ usuario: undefined }),
          expect.any(String)
        )
      })
    })

    describe('duração da requisição', () => {
      it('deve calcular duração quando startTime está definido', () => {
        const err = makeError({ status: 400 })
        const req = makeReq({ startTime: Date.now() - 100 })

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            timing: expect.objectContaining({ duration: expect.any(Number) }),
          }),
          expect.any(String)
        )
      })

      it('deve retornar undefined para duração quando startTime não definido', () => {
        const err = makeError({ status: 400 })
        const req = makeReq()

        errorLoggerMiddleware(err, req, makeRes(), makeNext())

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            timing: expect.objectContaining({ duration: undefined }),
          }),
          expect.any(String)
        )
      })
    })

    describe('passagem para próximo handler', () => {
      it('deve chamar next com o erro', () => {
        const err = makeError({ status: 400 })
        const next = makeNext()

        errorLoggerMiddleware(err, makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(err)
      })
    })
  })

  describe('errorResponseMiddleware', () => {

    describe('status codes', () => {
      it('deve usar status do erro', () => {
        const err = makeError({ status: 404 })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(404)
      })

      it('deve usar statusCode como fallback', () => {
        const err = new Error('teste') as AppError
        err.statusCode = 422

        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(422)
      })

      it('deve usar 500 como padrão quando status não definido', () => {
        const err = new Error('teste') as AppError
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.status).toHaveBeenCalledWith(500)
      })
    })

    describe('estrutura RFC 7807', () => {
      it('deve retornar campos obrigatórios do RFC 7807', () => {
        const err = makeError({ status: 400, message: 'Dados inválidos' })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

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

      it('deve mapear status 400 para tipo e título corretos', () => {
        const err = makeError({ status: 400 })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'https://helpme.com/errors/bad-request',
            title: 'Bad Request',
          })
        )
      })

      it('deve mapear status 401 corretamente', () => {
        const err = makeError({ status: 401 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unauthorized' }))
      })

      it('deve mapear status 403 corretamente', () => {
        const err = makeError({ status: 403 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Forbidden' }))
      })

      it('deve mapear status 404 corretamente', () => {
        const err = makeError({ status: 404 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not Found' }))
      })

      it('deve mapear status 409 corretamente', () => {
        const err = makeError({ status: 409 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conflict' }))
      })

      it('deve mapear status 422 corretamente', () => {
        const err = makeError({ status: 422 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Error' }))
      })

      it('deve mapear status 429 corretamente', () => {
        const err = makeError({ status: 429 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Too Many Requests' }))
      })

      it('deve mapear status 500 corretamente', () => {
        const err = makeError({ status: 500 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Internal Server Error' }))
      })

      it('deve mapear status 503 corretamente', () => {
        const err = makeError({ status: 503 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Service Unavailable' }))
      })

      it('deve mapear status desconhecido para "Error"', () => {
        const err = makeError({ status: 418 })
        const res = makeRes()
        errorResponseMiddleware(err, makeReq(), res, makeNext())
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error' }))
      })
    })

    describe('requestId e header', () => {
      it('deve incluir requestId na resposta quando definido', () => {
        const err = makeError({ status: 400, requestId: 'req-id-123' })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'req-id-123' })
        )
      })

      it('deve setar header X-Request-ID quando requestId definido', () => {
        const err = makeError({ status: 400, requestId: 'req-id-123' })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-id-123')
      })

      it('não deve setar header quando requestId não definido', () => {
        const err = makeError({ status: 400 })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.setHeader).not.toHaveBeenCalledWith('X-Request-ID', expect.anything())
      })
    })

    describe('erros de validação', () => {
      it('deve expor errors quando details.errors está presente', () => {
        const err = makeError({
          status: 422,
          details: { errors: ['Campo obrigatório', 'Email inválido'] },
        })
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ errors: ['Campo obrigatório', 'Email inválido'] })
        )
      })
    })

    describe('exposição de dados por ambiente', () => {
      const originalEnv = process.env.NODE_ENV

      afterEach(() => {
        process.env.NODE_ENV = originalEnv
      })

      it('deve incluir stack e details em desenvolvimento', () => {
        process.env.NODE_ENV = 'development'
        const err = makeError({ status: 500, details: { info: 'extra' } })
        err.stack = 'Error: test\n  at test.js:1'
        const res = makeRes()

        errorResponseMiddleware(err, makeReq(), res, makeNext())

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ stack: expect.any(String), details: expect.any(Object) })
        )
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
    })

    describe('headers já enviados', () => {
      it('deve chamar next quando headers já foram enviados', () => {
        const err = makeError({ status: 500 })
        const res = { ...makeRes(), headersSent: true } as unknown as Response
        const next = makeNext()

        errorResponseMiddleware(err, makeReq(), res, next)

        expect(next).toHaveBeenCalledWith(err)
      })

      it('não deve chamar json quando headers já enviados', () => {
        const err = makeError({ status: 500 })
        const res = makeRes();
        (res as any).headersSent = true
        const next = makeNext()

        errorResponseMiddleware(err, makeReq(), res, next)

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

    it('deve chamar next', () => {
      const next = makeNext()

      requestTimingMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('deve chamar next sem argumentos', () => {
      const next = makeNext()

      requestTimingMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalledWith()
    })
  })

  // ─── correlationIdMiddleware ────────────────────────────────────────────────

  describe('correlationIdMiddleware', () => {
    it('deve preservar x-correlation-id existente', () => {
      const req = makeReq({ headers: { 'x-correlation-id': 'existing-corr-id' } })
      const res = makeRes()

      correlationIdMiddleware(req, res, makeNext())

      expect(req.headers['x-correlation-id']).toBe('existing-corr-id')
    })

    it('deve preservar x-request-id como fallback', () => {
      const req = makeReq({ headers: { 'x-request-id': 'existing-req-id' } })
      const res = makeRes()

      correlationIdMiddleware(req, res, makeNext())

      expect(req.headers['x-correlation-id']).toBe('existing-req-id')
    })

    it('deve gerar novo correlation ID quando nenhum header presente', () => {
      const req = makeReq({ headers: {} })
      const res = makeRes()

      correlationIdMiddleware(req, res, makeNext())

      expect(req.headers['x-correlation-id']).toBeDefined()
      expect(typeof req.headers['x-correlation-id']).toBe('string')
    })

    it('deve setar header X-Correlation-ID na resposta', () => {
      const req = makeReq({ headers: { 'x-correlation-id': 'corr-id-abc' } })
      const res = makeRes()

      correlationIdMiddleware(req, res, makeNext())

      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'corr-id-abc')
    })

    it('deve chamar next', () => {
      const next = makeNext()

      correlationIdMiddleware(makeReq(), makeRes(), next)

      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('OperationalError', () => {
    it('deve setar isOperational=true', () => {
      const err = new OperationalError('teste', 500)
      expect(err.isOperational).toBe(true)
    })

    it('deve setar statusCode corretamente', () => {
      const err = new OperationalError('teste', 422)
      expect(err.statusCode).toBe(422)
    })

    it('deve setar code quando fornecido', () => {
      const err = new OperationalError('teste', 400, 'MEU_CODIGO')
      expect(err.code).toBe('MEU_CODIGO')
    })

    it('deve setar details quando fornecido', () => {
      const err = new OperationalError('teste', 400, undefined, { campo: 'valor' })
      expect(err.details).toEqual({ campo: 'valor' })
    })

    it('deve setar timestamp no construtor', () => {
      const err = new OperationalError('teste')
      expect(() => new Date(err.timestamp)).not.toThrow()
    })

    it('deve setar name como nome da classe', () => {
      const err = new OperationalError('teste')
      expect(err.name).toBe('OperationalError')
    })

    it('deve ter stack trace', () => {
      const err = new OperationalError('teste')
      expect(err.stack).toBeDefined()
    })
  })

  describe('BadRequestError', () => {
    it('deve ter statusCode 400', () => {
      expect(new BadRequestError().statusCode).toBe(400)
    })

    it('deve ter code BAD_REQUEST', () => {
      expect(new BadRequestError().code).toBe('BAD_REQUEST')
    })

    it('deve usar mensagem padrão', () => {
      expect(new BadRequestError().message).toBe('Bad Request')
    })

    it('deve aceitar mensagem personalizada', () => {
      expect(new BadRequestError('Campo inválido').message).toBe('Campo inválido')
    })

    it('deve aceitar details', () => {
      const err = new BadRequestError('msg', { campo: 'nome' })
      expect(err.details).toEqual({ campo: 'nome' })
    })
  })

  describe('UnauthorizedError', () => {
    it('deve ter statusCode 401', () => {
      expect(new UnauthorizedError().statusCode).toBe(401)
    })

    it('deve ter code UNAUTHORIZED', () => {
      expect(new UnauthorizedError().code).toBe('UNAUTHORIZED')
    })

    it('deve usar mensagem padrão', () => {
      expect(new UnauthorizedError().message).toBe('Unauthorized')
    })
  })

  describe('ForbiddenError', () => {
    it('deve ter statusCode 403', () => {
      expect(new ForbiddenError().statusCode).toBe(403)
    })

    it('deve ter code FORBIDDEN', () => {
      expect(new ForbiddenError().code).toBe('FORBIDDEN')
    })
  })

  describe('NotFoundError', () => {
    it('deve ter statusCode 404', () => {
      expect(new NotFoundError().statusCode).toBe(404)
    })

    it('deve ter code NOT_FOUND', () => {
      expect(new NotFoundError().code).toBe('NOT_FOUND')
    })

    it('deve usar mensagem padrão', () => {
      expect(new NotFoundError().message).toBe('Not Found')
    })
  })

  describe('ConflictError', () => {
    it('deve ter statusCode 409', () => {
      expect(new ConflictError().statusCode).toBe(409)
    })

    it('deve ter code CONFLICT', () => {
      expect(new ConflictError().code).toBe('CONFLICT')
    })
  })

  describe('ValidationError', () => {
    it('deve ter statusCode 422', () => {
      expect(new ValidationError().statusCode).toBe(422)
    })

    it('deve ter code VALIDATION_ERROR', () => {
      expect(new ValidationError().code).toBe('VALIDATION_ERROR')
    })

    it('deve usar mensagem padrão', () => {
      expect(new ValidationError().message).toBe('Validation Error')
    })

    it('deve aceitar details com erros de validação', () => {
      const err = new ValidationError('Inválido', { erros: ['Campo obrigatório'] })
      expect(err.details).toEqual({ erros: ['Campo obrigatório'] })
    })
  })

  describe('RateLimitError', () => {
    it('deve ter statusCode 429', () => {
      expect(new RateLimitError().statusCode).toBe(429)
    })

    it('deve ter code RATE_LIMIT_EXCEEDED', () => {
      expect(new RateLimitError().code).toBe('RATE_LIMIT_EXCEEDED')
    })
  })

  describe('ServiceUnavailableError', () => {
    it('deve ter statusCode 503', () => {
      expect(new ServiceUnavailableError().statusCode).toBe(503)
    })

    it('deve ter code SERVICE_UNAVAILABLE', () => {
      expect(new ServiceUnavailableError().code).toBe('SERVICE_UNAVAILABLE')
    })

    it('deve usar mensagem padrão', () => {
      expect(new ServiceUnavailableError().message).toBe('Service Unavailable')
    })
  })

  describe('herança de classes de erro', () => {
    it('BadRequestError deve ser instância de OperationalError', () => {
      expect(new BadRequestError()).toBeInstanceOf(OperationalError)
    })

    it('BadRequestError deve ser instância de Error', () => {
      expect(new BadRequestError()).toBeInstanceOf(Error)
    })

    it('NotFoundError deve ser instância de OperationalError', () => {
      expect(new NotFoundError()).toBeInstanceOf(OperationalError)
    })

    it('ValidationError deve ser instância de OperationalError', () => {
      expect(new ValidationError()).toBeInstanceOf(OperationalError)
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