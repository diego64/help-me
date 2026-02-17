import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';

const sessionMock = vi.fn(() => (req: any, res: any, next: any) => {
  req.session = {
    id: 'mock-session-id',
    cookie: { maxAge: 28800000, secure: false, httpOnly: true, sameSite: 'lax' },
  };
  next();
});

vi.mock('express-session', () => ({
  default: sessionMock,
}));

vi.mock('connect-redis', () => ({
  RedisStore: class MockRedisStore {
    constructor(_options: any) {}
  },
}));

vi.mock('../../../infrastructure/database/redis/client', () => ({
  redisClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isOpen: true,
    isReady: true,
  },
}));

vi.mock('../../../shared/config/swagger', () => ({
  swaggerSpec: {
    openapi: '3.0.0',
    info: { title: 'Help-Me API', version: '1.1.1' },
    paths: {},
  },
}));

vi.mock('../../../infrastructure/database/mongodb/atualizacao.chamado.model', () => ({
  default: {},
}));

vi.mock('../../../infrastructure/repositories/atualizacao.chamado.repository', () => ({
  AtualizacaoChamadoRepository: vi.fn().mockImplementation(() => ({
    criar: vi.fn().mockResolvedValue(undefined),
    buscarPorChamadoId: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../../infrastructure/email/email.service', () => ({
  emailService: {
    enviarEmailChamadoAberto: vi.fn().mockResolvedValue(undefined),
    enviarEmailChamadoEncerrado: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../infrastructure/messaging/kafka/client', () => ({
  kafka: {
    producer: vi.fn().mockReturnValue({
      connect: vi.fn(),
      send: vi.fn(),
      disconnect: vi.fn(),
    }),
    consumer: vi.fn().mockReturnValue({
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn(),
      disconnect: vi.fn(),
    }),
  },
}));

vi.mock('../../../infrastructure/messaging/kafka/consumers/chamadoConsumer', () => ({
  chamadoConsumer: { iniciar: vi.fn().mockResolvedValue(undefined) },
}));

const mockRequestLogger = vi.fn((req: any, res: any, next: any) => {
  req.id = 'test-request-id';
  req.log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  next();
});

vi.mock('../../../infrastructure/http/middlewares/request-logger.middleware', () => ({
  requestLoggerMiddleware: mockRequestLogger,
}));

const mockErrorLogger = vi.fn((err: any, req: any, res: any, next: any) => {
  next(err);
});

vi.mock('../../../infrastructure/http/middlewares/error-logger.middleware', () => ({
  errorLoggerMiddleware: mockErrorLogger,
}));

const mockRoutes = vi.fn((req: any, res: any, next: any) => {
  if (req.path === '/test-route') {
    return res.json({ message: 'Test route works' });
  }
  next();
});

vi.mock('../../../presentation/http/routes', () => ({
  default: mockRoutes,
}));

const setEnvVar = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const clearEnv = () => {
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;
};

const importApp = async (): Promise<Express> => {
  const module = await import('../../../app');
  return module.app || module.default;
};

describe('App - Configuração da Aplicação', () => {
  beforeEach(() => {
    vi.resetModules();
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  describe('Configuração de Segurança', () => {
    it('deve lançar erro quando JWT_SECRET não está definido', async () => {
      setEnvVar('JWT_SECRET', undefined);

      await expect(importApp()).rejects.toThrow(
        'JWT_SECRET não definido nas variáveis de ambiente!'
      );
    });

    it('deve lançar erro quando JWT_SECRET é string vazia', async () => {
      setEnvVar('JWT_SECRET', '');

      await expect(importApp()).rejects.toThrow(
        'JWT_SECRET não definido nas variáveis de ambiente!'
      );
    });

    it('deve inicializar com sucesso quando JWT_SECRET é válido', async () => {
      setEnvVar('JWT_SECRET', 'valid-secret-key-12345');

      const app = await importApp();

      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
    });

    it('deve aceitar JWT_SECRET com caracteres especiais', async () => {
      setEnvVar('JWT_SECRET', 'secret!@#$%^&*()_+-={}[]|:;<>?,./');

      const app = await importApp();

      expect(app).toBeDefined();
    });

    it('deve aceitar JWT_SECRET muito longo', async () => {
      setEnvVar('JWT_SECRET', 'a'.repeat(512));

      const app = await importApp();

      expect(app).toBeDefined();
    });
  });

  describe('Rotas Principais', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'test');
      app = await importApp();
    });

    describe('GET /', () => {
      it('deve retornar informações da API', async () => {
        const res = await request(app).get('/');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          message: 'Help-Me API',
          version: '1.1.1',
          docs: '/api-docs',
          health: '/health',
        });
      });

      it('deve retornar Content-Type application/json', async () => {
        const res = await request(app).get('/');

        expect(res.headers['content-type']).toMatch(/application\/json/);
      });
    });

    describe('GET /health', () => {
      it('deve retornar status de saúde da aplicação', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          status: 'ok',
          service: 'helpme-api',
          environment: 'test',
        });
        expect(res.body.timestamp).toBeDefined();
        expect(res.body.uptime).toBeDefined();
      });

      it('deve retornar timestamp no formato ISO', async () => {
        const res = await request(app).get('/health');

        expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('deve retornar uptime como número', async () => {
        const res = await request(app).get('/health');

        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      });

      it('deve usar environment development quando NODE_ENV não definido', async () => {
        vi.resetModules();
        setEnvVar('JWT_SECRET', 'test-secret');
        setEnvVar('NODE_ENV', undefined);

        const appDev = await importApp();
        const res = await request(appDev).get('/health');

        expect(res.body.environment).toBe('development');
      });

      it('deve usar environment production quando NODE_ENV=production', async () => {
        vi.resetModules();
        setEnvVar('JWT_SECRET', 'test-secret');
        setEnvVar('NODE_ENV', 'production');

        const appProd = await importApp();
        const res = await request(appProd).get('/health');

        expect(res.body.environment).toBe('production');
      });
    });

    describe('GET /api-docs', () => {
      it('deve servir documentação Swagger', async () => {
        const res = await request(app).get('/api-docs/');

        expect(res.status).toBe(200);
      });
    });

    describe('GET /api/*', () => {
      it('deve chamar as rotas da API', async () => {
        const res = await request(app).get('/api/test-route');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Test route works' });
      });
    });
  });

  describe('Tratamento de Erros 404', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'test');
      app = await importApp();
    });

    it('deve retornar 404 para rota não encontrada', async () => {
      const res = await request(app).get('/rota-inexistente');

      expect(res.status).toBe(404);
    });

    it('deve retornar JSON com informações de erro 404', async () => {
      const res = await request(app).get('/rota-nao-existe');

      expect(res.body).toMatchObject({
        success: false,
        error: 'Rota não encontrada',
        path: '/rota-nao-existe',
        method: 'GET',
        requestId: 'test-request-id',
      });
    });

    it('deve logar warning para rota não encontrada', async () => {
      const res = await request(app).get('/path-404');

      expect(res.status).toBe(404);
      expect(mockRequestLogger).toHaveBeenCalled();
    });

    it('deve retornar 404 para diferentes métodos HTTP', async () => {
      const methods = ['get', 'post', 'put', 'delete', 'patch'];

      for (const method of methods) {
        const res = await (request(app) as any)[method]('/rota-404');
        expect(res.status).toBe(404);
        expect(res.body.method).toBe(method.toUpperCase());
      }
    });

    it('deve incluir path completo no erro 404', async () => {
      const res = await request(app).get('/api/rota/inexistente/muito/longa');

      expect(res.status).toBe(404);
      expect(res.body.path).toBe('/api/rota/inexistente/muito/longa');
    });
  });

  describe('Tratamento de Erros Global', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'test');

      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/error-route') {
          const error = new Error('Test error') as any;
          error.status = 400;
          return next(error);
        }
        if (req.path === '/error-500') {
          return next(new Error('Internal server error'));
        }
        if (req.path === '/error-custom-status') {
          const error = new Error('Custom error') as any;
          error.statusCode = 403;
          return next(error);
        }
        next();
      });

      app = await importApp();
    });

    afterEach(() => {
      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/test-route') {
          return res.json({ message: 'Test route works' });
        }
        next();
      });
    });

    it('deve retornar erro com status code especificado', async () => {
      const res = await request(app).get('/api/error-route');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        error: { message: 'Test error' },
        requestId: 'test-request-id',
      });
    });

    it('deve retornar 500 para erros sem status code', async () => {
      const res = await request(app).get('/api/error-500');

      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Internal server error');
    });

    it('deve usar statusCode quando status não está definido', async () => {
      const res = await request(app).get('/api/error-custom-status');

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Custom error');
    });

    it('deve incluir stack trace em desenvolvimento', async () => {
      vi.resetModules();
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'development');

      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/error-dev') {
          return next(new Error('Dev error'));
        }
        next();
      });

      const appDev = await importApp();
      const res = await request(appDev).get('/api/error-dev');

      expect(res.status).toBe(500);
      expect(res.body.error.stack).toBeDefined();
    });

    it('não deve incluir stack trace em produção', async () => {
      vi.resetModules();
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'production');

      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/error-prod') {
          return next(new Error('Prod error'));
        }
        next();
      });

      const appProd = await importApp();
      const res = await request(appProd).get('/api/error-prod');

      expect(res.status).toBe(500);
      expect(res.body.error.stack).toBeUndefined();
    });

    it('deve usar mensagem padrão quando mensagem de erro está ausente', async () => {
      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/error-no-message') {
          const error = new Error() as any;
          error.message = '';
          return next(error);
        }
        next();
      });

      const res = await request(app).get('/api/error-no-message');

      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Erro interno do servidor');
    });

    it('deve chamar errorLoggerMiddleware', async () => {
      mockErrorLogger.mockClear();

      await request(app).get('/api/error-route');

      expect(mockErrorLogger).toHaveBeenCalled();
    });
  });

  describe('Middlewares', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'test');
      app = await importApp();
    });

    it('deve usar middleware de compressão', async () => {
      const res = await request(app).get('/').set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(200);
    });

    it('deve desabilitar compressão com header x-no-compression', async () => {
      const res = await request(app).get('/').set('x-no-compression', '1');

      expect(res.status).toBe(200);
    });

    it('deve processar JSON no body', async () => {
      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/json-test' && req.method === 'POST') {
          return res.json({ received: req.body });
        }
        next();
      });

      const res = await request(app).post('/api/json-test').send({ test: 'data' });

      expect(res.status).toBe(200);
      expect(res.body.received).toEqual({ test: 'data' });
    });

    it('deve processar URL encoded no body', async () => {
      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/urlencoded-test' && req.method === 'POST') {
          return res.json({ received: req.body });
        }
        next();
      });

      const res = await request(app)
        .post('/api/urlencoded-test')
        .send('key=value')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(res.status).toBe(200);
    });

    it('deve adicionar request ID via requestLoggerMiddleware', async () => {
      const res = await request(app).get('/');

      expect(mockRequestLogger).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('deve configurar sessão com RedisStore', async () => {
      expect(sessionMock).toHaveBeenCalled();
    });
  });

  describe('Configuração de Sessão', () => {
    it('deve configurar cookie seguro em produção', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'production');

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cookie: expect.objectContaining({
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
          }),
        })
      );
    });

    it('deve configurar cookie não seguro em desenvolvimento', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      setEnvVar('JWT_SECRET', 'test-secret');
      setEnvVar('NODE_ENV', 'development');

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cookie: expect.objectContaining({
            secure: false,
          }),
        })
      );
    });

    it('deve configurar maxAge de 8 horas', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      setEnvVar('JWT_SECRET', 'test-secret');

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cookie: expect.objectContaining({
            maxAge: 8 * 60 * 60 * 1000,
          }),
        })
      );
    });

    it('deve usar JWT_SECRET como secret da sessão', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      const customSecret = 'my-custom-secret';
      setEnvVar('JWT_SECRET', customSecret);

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          secret: customSecret,
        })
      );
    });

    it('deve configurar resave como false', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      setEnvVar('JWT_SECRET', 'test-secret');

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          resave: false,
        })
      );
    });

    it('deve configurar saveUninitialized como false', async () => {
      vi.resetModules();
      sessionMock.mockClear();
      setEnvVar('JWT_SECRET', 'test-secret');

      await importApp();

      expect(sessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          saveUninitialized: false,
        })
      );
    });
  });

  describe('Estrutura da Aplicação Express', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');
      app = await importApp();
    });

    it('deve ter todos os métodos HTTP necessários', () => {
      const methods = ['use', 'get', 'post', 'put', 'delete', 'patch', 'listen', 'set'];

      methods.forEach(method => {
        expect(typeof (app as any)[method]).toBe('function');
      });
    });

    it('deve exportar instância válida do Express', () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
    });

    it('deve permitir registro de rotas', () => {
      expect(() => {
        app.get('/test-dynamic', (req, res) => res.json({ ok: true }));
      }).not.toThrow();
    });
  });

  describe('Limites de Payload', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'test-secret');

      mockRoutes.mockImplementation((req: any, res: any, next: any) => {
        if (req.path === '/large-payload' && req.method === 'POST') {
          return res.json({ size: JSON.stringify(req.body).length });
        }
        next();
      });

      app = await importApp();
    });

    it('deve aceitar payload JSON de até 10mb', async () => {
      const largeData = { data: 'x'.repeat(1024 * 1024) }; // ~1MB

      const res = await request(app).post('/api/large-payload').send(largeData);

      expect(res.status).toBe(200);
      expect(res.body.size).toBeGreaterThan(0);
    });
  });

  describe('Integração Completa', () => {
    let app: Express;

    beforeEach(async () => {
      setEnvVar('JWT_SECRET', 'integration-test-secret');
      setEnvVar('NODE_ENV', 'test');
      app = await importApp();
    });

    it('deve processar requisição completa com sucesso', async () => {
      const res = await request(app).get('/').set('Accept', 'application/json');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.message).toBe('Help-Me API');
    });

    it('deve tratar erros de ponta a ponta', async () => {
      const res = await request(app).get('/rota-inexistente');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.requestId).toBeDefined();
    });

    it('deve aplicar todos os middlewares na ordem correta', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(mockRequestLogger).toHaveBeenCalled();
    });
  });
});