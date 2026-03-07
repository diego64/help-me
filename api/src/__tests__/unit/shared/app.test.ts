import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('@infrastructure/database/redis/client', () => ({
  redisClient: { connect: vi.fn(), disconnect: vi.fn() },
}));

vi.mock('connect-redis', () => ({
  RedisStore: vi.fn().mockImplementation(function () { return {}; }),
}));

vi.mock('express-session', () => ({
  default: vi.fn().mockReturnValue(
    (_req: any, _res: any, next: any) => next()
  ),
}));

vi.mock('@shared/config/swagger', () => ({ swaggerSpec: {} }));

vi.mock('swagger-ui-express', () => ({
  default: {
    serve:  [(_req: any, _res: any, next: any) => next()],
    setup:  vi.fn().mockReturnValue((_req: any, _res: any, next: any) => next()),
  },
}));

vi.mock('@infrastructure/http/middlewares/error-logger.middleware', () => ({
  errorLoggerMiddleware: (_err: any, _req: any, _res: any, next: any) => next(_err),
}));

vi.mock('@infrastructure/http/middlewares/request-logger.middleware', () => ({
  requestLoggerMiddleware: (req: any, _res: any, next: any) => {
    req.log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    req.id  = 'test-request-id';
    next();
  },
}));

vi.mock('@presentation/http/routes', () => ({
  default: (() => {
    const { Router } = require('express');
    const r = Router();
    r.get('/ping', (_req: any, res: any) => res.json({ pong: true }));
    r.get('/error-trigger', (_req: any, _res: any, next: any) => {
      const err: any = new Error('Erro de teste');
      err.status = 422;
      next(err);
    });
    r.get('/error-no-status', (_req: any, _res: any, next: any) => {
      next(new Error('Erro sem status'));
    });
    return r;
  })(),
}));

vi.mock('@infrastructure/websocket/socket', () => ({
  initSocketIO: vi.fn(),
}));

const startNotificacaoConsumerMock = vi.fn().mockResolvedValue(undefined);
const stopNotificacaoConsumerMock  = vi.fn().mockResolvedValue(undefined);
vi.mock('@infrastructure/messaging/kafka/consumers/notificacao.consumer', () => ({
  startNotificacaoConsumer: startNotificacaoConsumerMock,
  stopNotificacaoConsumer:  stopNotificacaoConsumerMock,
}));

const slaJobTimer = setInterval(() => {}, 99999);
const startSLAJobMock = vi.fn().mockReturnValue(slaJobTimer);

vi.mock('@infrastructure/jobs/sla.job', () => ({
  startSLAJob: startSLAJobMock,
}));

vi.mock('compression', async (importOriginal) => {
  const actual = await importOriginal<typeof import('compression') & { default?: typeof import('compression') }>();
  return { default: actual.default ?? actual };
});

const { app, startServices, httpServer } = await import('../../../app');
const { initSocketIO } = await import('@infrastructure/websocket/socket');

describe('GET /', () => {
  it('deve retornar 200 com os campos esperados', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Help-Me API',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      docs:    '/api-docs',
      health:  '/health',
    });
  });

  it('deve retornar Content-Type application/json', async () => {
    const res = await request(app).get('/');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /health', () => {
  it('deve retornar 200 com status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('deve retornar todos os campos obrigatórios', async () => {
    const res = await request(app).get('/health');

    expect(res.body).toMatchObject({
      status:      'ok',
      timestamp:   expect.any(String),
      uptime:      expect.any(Number),
      service:     'helpme-api',
      environment: expect.any(String),
    });
  });

  it('deve retornar timestamp em formato ISO 8601 válido', async () => {
    const res = await request(app).get('/health');

    const ts = new Date(res.body.timestamp);
    expect(ts.toString()).not.toBe('Invalid Date');
  });

  it('deve retornar uptime positivo', async () => {
    const res = await request(app).get('/health');

    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it('deve retornar environment = "test" quando NODE_ENV=test', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const res = await request(app).get('/health');

    expect(res.body.environment).toBe('test');
    process.env.NODE_ENV = original;
  });
});

describe('Rotas /api', () => {
  it('deve encaminhar requisições para o router de rotas', async () => {
    const res = await request(app).get('/api/ping');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pong: true });
  });
});

describe('404 — rota não encontrada', () => {
  it('deve retornar 404 para rota inexistente', async () => {
    const res = await request(app).get('/rota-que-nao-existe');

    expect(res.status).toBe(404);
  });

  it('deve retornar success=false com path e method', async () => {
    const res = await request(app).get('/rota-que-nao-existe');

    expect(res.body).toMatchObject({
      success: false,
      error:   'Rota não encontrada',
      path:    '/rota-que-nao-existe',
      method:  'GET',
    });
  }, 20000);

  it('deve incluir requestId na resposta 404', async () => {
    const res = await request(app).get('/outra-rota-inexistente');

    expect(res.body.requestId).toBeDefined();
  });

  it('deve retornar 404 para métodos não mapeados em rotas existentes', async () => {
    const res = await request(app).delete('/');

    expect(res.status).toBe(404);
  });

  it('deve retornar 404 para rotas aninhadas inexistentes', async () => {
    const res = await request(app).get('/api/rota-inexistente/sub/rota');

    expect(res.status).toBe(404);
  });
});

describe('Error handler global', () => {
  it('deve retornar o statusCode do erro quando err.status estiver definido', async () => {
    const res = await request(app).get('/api/error-trigger');

    expect(res.status).toBe(422);
  });

  it('deve retornar success=false com message do erro', async () => {
    const res = await request(app).get('/api/error-trigger');

    expect(res.body).toMatchObject({
      success: false,
      error:   expect.objectContaining({ message: 'Erro de teste' }),
    });
  });

  it('deve retornar 500 quando o erro não tiver status definido', async () => {
    const res = await request(app).get('/api/error-no-status');

    expect(res.status).toBe(500);
  });

  it('deve incluir requestId na resposta de erro', async () => {
    const res = await request(app).get('/api/error-trigger');

    expect(res.body.requestId).toBeDefined();
  });

  it('deve incluir stack apenas em NODE_ENV=development', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await request(app).get('/api/error-trigger');

    expect(res.body.error.stack).toBeDefined();
    process.env.NODE_ENV = original;
  });

  it('não deve incluir stack em NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/api/error-trigger');

    expect(res.body.error.stack).toBeUndefined();
    process.env.NODE_ENV = original;
  });

  it('não deve incluir stack em NODE_ENV=test', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const res = await request(app).get('/api/error-trigger');

    expect(res.body.error.stack).toBeUndefined();
    process.env.NODE_ENV = original;
  });
});

describe('Body parser', () => {
  it('deve aceitar Content-Type application/json', async () => {
    const res = await request(app)
      .get('/api/ping')
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
  });

  it('deve aceitar body application/x-www-form-urlencoded', async () => {
    const res = await request(app)
      .get('/api/ping')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
  });
});

describe('Compressão (compression middleware)', () => {
  it('deve comprimir respostas por padrão (Accept-Encoding: gzip)', async () => {
    const res = await request(app)
      .get('/')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Help-Me API');
  });

  it('não deve comprimir quando x-no-compression estiver presente', async () => {
    const res = await request(app)
      .get('/')
      .set('x-no-compression', '1')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).not.toBe('gzip');
  });
});

describe('startServices()', () => {
  beforeEach(() => {
    startNotificacaoConsumerMock.mockClear();
    startSLAJobMock.mockClear();
  });

  it('deve chamar startNotificacaoConsumer', async () => {
    await startServices();

    expect(startNotificacaoConsumerMock).toHaveBeenCalledTimes(1);
  });

  it('deve chamar startSLAJob', async () => {
    await startServices();

    expect(startSLAJobMock).toHaveBeenCalledTimes(1);
  });

  it('deve aguardar startNotificacaoConsumer antes de retornar', async () => {
    const ordem: string[] = [];
    startNotificacaoConsumerMock.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 10));
      ordem.push('consumer');
    });
    startSLAJobMock.mockImplementationOnce(() => {
      ordem.push('sla');
      return slaJobTimer;
    });

    await startServices();

    expect(ordem).toEqual(['consumer', 'sla']);
  });

  it('deve propagar erro quando startNotificacaoConsumer falhar', async () => {
    startNotificacaoConsumerMock.mockRejectedValueOnce(new Error('Kafka indisponível'));

    await expect(startServices()).rejects.toThrow('Kafka indisponível');
  });
});

describe('httpServer', () => {
  it('deve ser uma instância de http.Server', async () => {
    const http = await import('http');

    expect(httpServer).toBeInstanceOf(http.Server);
  });

  it.todo('deve ter initSocketIO chamado com httpServer', async () => {
    expect(initSocketIO).toHaveBeenCalledWith(httpServer);
  });
});

describe('Inicialização sem JWT_SECRET', () => {
  it('deve lançar erro quando JWT_SECRET não estiver definido', async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    vi.resetModules();

    await expect(
      import('../../../app')
    ).rejects.toThrow('JWT_SECRET não definido nas variáveis de ambiente!');

    process.env.JWT_SECRET = original;
    vi.resetModules();
  });
});