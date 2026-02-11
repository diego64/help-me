import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const mockLoggerFunctions = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../shared/config/logger', () => ({
  logger: mockLoggerFunctions,
}));

import {
  errorLoggerMiddleware,
  errorResponseMiddleware,
  requestTimingMiddleware,
  correlationIdMiddleware,
  OperationalError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServiceUnavailableError,
  AppError,
} from '../../infrastructure/http/middlewares/error-logger.middleware';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRequest = {
      method: 'POST',
      url: '/api/test',
      originalUrl: '/api/test',
      path: '/api/test',
      headers: {
        'user-agent': 'jest-test',
        'content-type': 'application/json',
      },
      query: {},
      params: {},
      body: {},
      socket: {
        remoteAddress: '127.0.0.1',
      } as any,
      get: vi.fn((header: string) => {
        const headers: any = {
          'user-agent': 'jest-test',
          'content-type': 'application/json',
        };
        return headers[header];
      }),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false,
    };

    mockNext = vi.fn();
  });

  describe('errorLoggerMiddleware', () => {
    describe('Logging de erros básicos', () => {
      it('deve logar erro 500 como fatal', () => {
        const error: AppError = {
          name: 'InternalError',
          message: 'Something went wrong',
          statusCode: 500,
        } as AppError;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockLoggerFunctions.fatal).toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledWith(error);
      });

      it('deve logar erro 400 como warn', () => {
        const error: AppError = {
          name: 'BadRequest',
          message: 'Invalid input',
          statusCode: 400,
          isOperational: true,
        } as AppError;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockLoggerFunctions.warn).toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledWith(error);
      });

      it('deve logar erro não-operacional como fatal', () => {
        const error: AppError = {
          name: 'ProgrammingError',
          message: 'Unexpected error',
          isOperational: false,
        } as AppError;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockLoggerFunctions.fatal).toHaveBeenCalled();
      });
    });

    describe('Sanitização de dados sensíveis', () => {
      it('deve redactar campo password do body', () => {
        mockRequest.body = {
          email: 'user@test.com',
          password: 'secret123',
          name: 'John Doe',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.body.password).toBe('[REDACTED]');
        expect(logCall[0].request.body.email).toBe('user@test.com');
        expect(logCall[0].request.body.name).toBe('John Doe');
      });

      it('deve redactar múltiplos campos sensíveis', () => {
        mockRequest.body = {
          username: 'testuser',
          password: 'secret123',
          token: 'jwt-token-here',
          api_key: 'api-key-123',
          data: 'safe data',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.body.password).toBe('[REDACTED]');
        expect(logCall[0].request.body.token).toBe('[REDACTED]');
        expect(logCall[0].request.body.api_key).toBe('[REDACTED]');
        expect(logCall[0].request.body.username).toBe('testuser');
        expect(logCall[0].request.body.data).toBe('safe data');
      });

      it('deve redactar campos sensíveis em objetos nested', () => {
        mockRequest.body = {
          user: {
            name: 'John',
            credentials: {
              password: 'secret',
              token: 'jwt-123',
            },
          },
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.body.user.credentials.password).toBe('[REDACTED]');
        expect(logCall[0].request.body.user.credentials.token).toBe('[REDACTED]');
        expect(logCall[0].request.body.user.name).toBe('John');
      });

      it('deve redactar campos sensíveis em arrays', () => {
        mockRequest.body = {
          users: [
            { name: 'User1', password: 'pass1' },
            { name: 'User2', password: 'pass2' },
          ],
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.body.users[0].password).toBe('[REDACTED]');
        expect(logCall[0].request.body.users[1].password).toBe('[REDACTED]');
        expect(logCall[0].request.body.users[0].name).toBe('User1');
      });

      it('deve sanitizar authorization header mas mostrar tipo', () => {
        mockRequest.headers = {
          ...mockRequest.headers,
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 401;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.headers.authorization).toBe('Bearer [REDACTED]');
      });
    });

    describe('Contexto da requisição', () => {
      it('deve incluir informações completas da requisição', () => {
        mockRequest = {
          ...mockRequest,
          method: 'POST',
          url: '/api/users',
          originalUrl: '/api/users',
          path: '/api/users',
          query: { page: '1' },
          params: { id: '123' },
          body: { name: 'Test' },
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.method).toBe('POST');
        expect(logCall[0].request.url).toBe('/api/users');
        expect(logCall[0].request.path).toBe('/api/users');
        expect(logCall[0].request.query).toEqual({ page: '1' });
        expect(logCall[0].request.params).toEqual({ id: '123' });
      });

      it('deve extrair contexto do usuário autenticado', () => {
        (mockRequest as any).user = {
          id: 'user-123',
          email: 'user@test.com',
          role: 'ADMIN',
          name: 'John Doe', // Não deve logar PII
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 403;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].user).toBeDefined();
        expect(logCall[0].user.id).toBe('user-123');
        expect(logCall[0].user.email).toBe('user@test.com');
        expect(logCall[0].user.role).toBe('ADMIN');
        expect(logCall[0].user.name).toBeUndefined(); // PII não deve ser logado
      });

      it('deve capturar IP real considerando proxies', () => {
        mockRequest.headers = {
          ...mockRequest.headers,
          'x-forwarded-for': '203.0.113.1, 198.51.100.1',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.ip).toBe('203.0.113.1, 198.51.100.1');
      });
    });

    describe('Correlation ID', () => {
      it('deve usar x-correlation-id existente', () => {
        mockRequest.headers = {
          ...mockRequest.headers,
          'x-correlation-id': 'existing-correlation-id',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(error.requestId).toBe('existing-correlation-id');
        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.id).toBe('existing-correlation-id');
      });

      it('deve usar x-request-id se x-correlation-id não existir', () => {
        mockRequest.headers = {
          ...mockRequest.headers,
          'x-request-id': 'request-id-123',
        };

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(error.requestId).toBe('request-id-123');
      });

      it('deve gerar correlation ID se nenhum existir', () => {
        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(error.requestId).toBeDefined();
        expect(typeof error.requestId).toBe('string');
        expect(error.requestId!.length).toBeGreaterThan(0);
      });
    });

    describe('Performance metrics', () => {
      it('deve calcular duração da requisição', () => {
        const startTime = Date.now() - 1000;
        (mockRequest as any).startTime = startTime;

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].timing.duration).toBeGreaterThanOrEqual(1000);
        expect(logCall[0].timing.duration).toBeLessThan(1100);
      });

      it('deve retornar undefined se startTime não existir', () => {
        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].timing.duration).toBeUndefined();
      });
    });

    describe('Limitação de tamanho', () => {
      it('deve truncar body muito grande', () => {
        const largeBody = {
          data: 'x'.repeat(15000), // Maior que MAX_BODY_LOG_SIZE
        };
        mockRequest.body = largeBody;

        const error = new Error('Test error') as AppError;
        error.statusCode = 400;

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.warn.mock.calls[0];
        expect(logCall[0].request.body._truncated).toBe(true);
        expect(logCall[0].request.body._originalSize).toBeGreaterThan(10000);
      });

      it('deve limitar stack trace', () => {
        const error = new Error('Test with long stack') as AppError;
        error.statusCode = 500;
        error.stack = Array(50).fill('at someFunction (file.ts:123)').join('\n');

        errorLoggerMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const logCall = mockLoggerFunctions.fatal.mock.calls[0];
        expect(logCall[0].error.stack).toBeDefined();
        expect(logCall[0].error.stack.length).toBeLessThanOrEqual(15);
      });
    });
  });

  describe('errorResponseMiddleware', () => {
    it('deve enviar resposta RFC 7807 compliant', () => {
      const error = new BadRequestError('Invalid input');
      (error as AppError).requestId = 'correlation-123';

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalled();
      
      const response = (mockResponse.json as any).mock.calls[0][0];
      expect(response.type).toContain('/errors/bad-request');
      expect(response.title).toBe('Bad Request');
      expect(response.status).toBe(400);
      expect(response.detail).toBe('Invalid input');
      expect(response.requestId).toBe('correlation-123');
    });

    it('não deve enviar resposta se headers já foram enviados', () => {
      mockResponse.headersSent = true;
      const error = new Error('Test') as AppError;

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('deve incluir stack em desenvolvimento', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error') as AppError;
      error.statusCode = 500;

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const response = (mockResponse.json as any).mock.calls[0][0];
      expect(response.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('não deve incluir stack em produção', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error') as AppError;
      error.statusCode = 500;

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const response = (mockResponse.json as any).mock.calls[0][0];
      expect(response.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('deve adicionar X-Request-ID header', () => {
      const error = new Error('Test') as AppError;
      error.requestId = 'req-123';
      error.statusCode = 400;

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    });
  });

  describe('requestTimingMiddleware', () => {
    it('deve adicionar startTime à requisição', () => {
      const beforeTime = Date.now();
      
      requestTimingMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const afterTime = Date.now();

      expect((mockRequest as any).startTime).toBeDefined();
      expect((mockRequest as any).startTime).toBeGreaterThanOrEqual(beforeTime);
      expect((mockRequest as any).startTime).toBeLessThanOrEqual(afterTime);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('correlationIdMiddleware', () => {
    it('deve usar correlation ID existente', () => {
      mockRequest.headers = {
        ...mockRequest.headers,
        'x-correlation-id': 'existing-id',
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.headers['x-correlation-id']).toBe('existing-id');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'existing-id');
      expect(mockNext).toHaveBeenCalled();
    });

    it('deve adicionar X-Request-ID header', () => {
      const error = new Error('Test') as AppError;
      error.requestId = 'req-123';
      error.statusCode = 400;

      errorResponseMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    });
  });

  describe('Custom Error Classes', () => {
    it('badRequestError deve ter statusCode 400', () => {
      const error = new BadRequestError('Invalid data');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.isOperational).toBe(true);
    });

    it('unauthorizedError deve ter statusCode 401', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('forbiddenError deve ter statusCode 403', () => {
      const error = new ForbiddenError('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('notFoundError deve ter statusCode 404', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });

    it('conflictError deve ter statusCode 409', () => {
      const error = new ConflictError('Email already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });

    it('validationError deve ter statusCode 422', () => {
      const error = new ValidationError('Validation failed', {
        errors: [{ field: 'email', message: 'Invalid email' }],
      });
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toBeDefined();
    });

    it('rateLimitError deve ter statusCode 429', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('serviceUnavailableError deve ter statusCode 503', () => {
      const error = new ServiceUnavailableError();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('operationalError deve incluir timestamp', () => {
      const beforeTime = new Date().toISOString();
      const error = new OperationalError('Test error', 500);
      const afterTime = new Date().toISOString();

      expect(error.timestamp).toBeDefined();
      expect(typeof error.timestamp).toBe('string');
      expect(error.timestamp.length).toBeGreaterThan(0);
      // Verifica se é um ISO string válido
      expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
    });
  });
});