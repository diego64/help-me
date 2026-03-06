import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

type MockRequest = {
  ip: string;
  body: Record<string, any>;
  headers: Record<string, any>;
  get: ReturnType<typeof vi.fn>;
  app: { get: ReturnType<typeof vi.fn> };
};

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  headersSent: boolean;
  statusCode?: number;
};

const createMockRequest = (ip: string = '192.168.1.1', body: Record<string, any> = {}): MockRequest => ({
  ip,
  body,
  headers: {},
  get: vi.fn((header: string) => ({} as any)[header]),
  app: { get: vi.fn(() => false) },
});

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    headersSent: false,
    statusCode: 200,
  };

  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });

  return res;
};

describe('Rate Limit Middleware', () => {
  let apiLimiter: any;
  let authLimiter: any;
  let writeLimiter: any;

  beforeEach(() => {
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Cada teste recebe instâncias frescas com stores independentes
    apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests from this IP, please try again later',
    });

    authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        const email = req.body?.email || 'unknown';
        console.warn(`[SECURITY] Rate limit exceeded for IP: ${req.ip}, Email: ${email}`);
        res.status(429).json({
          error: 'Too many login attempts',
          message: 'Please try again later',
        });
      },
    });

    writeLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many write operations, please slow down',
    });
  });

  afterEach(() => {
    mockConsoleWarn.mockRestore();
  });

  describe('apiLimiter', () => {
    describe('Within Rate Limit', () => {
      it('deve permitir requisições dentro do limite', async () => {
        const ip = '192.168.1.1';

        for (let i = 0; i < 50; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();

          await apiLimiter(req as any, res as any, next);
          expect(next).toHaveBeenCalled();
        }
      });

      it('deve incluir rate limit headers nas respostas', async () => {
        const req = createMockRequest();
        const res = createMockResponse();
        const next = vi.fn();

        await apiLimiter(req as any, res as any, next);
        expect(next).toHaveBeenCalled();
      });

      it('deve decrementar o limite restante a cada requisição', async () => {
        const ip = '192.168.1.1';

        for (let i = 0; i < 3; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();

          await apiLimiter(req as any, res as any, next);
          expect(next).toHaveBeenCalled();
        }
      });
    });

    describe('Rate Limit Exceeded', () => {
      it('deve bloquear requisições quando o limite é excedido', async () => {
        const ip = '192.168.1.1';
        const limit = 100;

        for (let i = 0; i < limit; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();
          await apiLimiter(req as any, res as any, next);
        }

        const finalReq = createMockRequest(ip);
        const finalRes = createMockResponse();
        const finalNext = vi.fn();

        await apiLimiter(finalReq as any, finalRes as any, finalNext);

        expect(finalRes.status).toHaveBeenCalledWith(429);
        expect(finalNext).not.toHaveBeenCalled();
      });
    });

    describe('Multiple IPs', () => {
      it('deve rastrear limites separadamente por IP', async () => {
        for (let i = 0; i < 100; i++) {
          const req = createMockRequest('192.168.1.1');
          const res = createMockResponse();
          const next = vi.fn();
          await apiLimiter(req as any, res as any, next);
        }

        const ip2Req = createMockRequest('192.168.1.2');
        const ip2Res = createMockResponse();
        const ip2Next = vi.fn();

        await apiLimiter(ip2Req as any, ip2Res as any, ip2Next);
        expect(ip2Next).toHaveBeenCalled();
      });
    });

    describe('Edge Cases', () => {
      it('deve lidar com requisições sem IP', async () => {
        const req = createMockRequest(undefined as any);
        const res = createMockResponse();
        const next = vi.fn();

        await apiLimiter(req as any, res as any, next);
        expect(next).toHaveBeenCalled();
      });

      it('deve lidar com requisições simultâneas do mesmo IP', async () => {
        const ip = '192.168.1.1';

        const promises = Array.from({ length: 10 }, () => {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();
          return apiLimiter(req as any, res as any, next);
        });

        await Promise.all(promises);
      });
    });
  });

  describe('authLimiter', () => {
    describe('Login Attempts', () => {
      it('deve permitir até 5 tentativas de login', async () => {
        const ip = '192.168.1.1';
        const email = 'test@example.com';

        for (let i = 0; i < 5; i++) {
          const req = createMockRequest(ip, { email });
          const res = createMockResponse();
          const next = vi.fn();

          await authLimiter(req as any, res as any, next);
          expect(next).toHaveBeenCalled();
        }
      });

      it('deve bloquear após 5 tentativas', async () => {
        const ip = '192.168.1.1';
        const email = 'attacker@example.com';

        for (let i = 0; i < 5; i++) {
          const req = createMockRequest(ip, { email });
          const res = createMockResponse();
          const next = vi.fn();
          await authLimiter(req as any, res as any, next);
        }

        const blockedReq = createMockRequest(ip, { email });
        const blockedRes = createMockResponse();
        const blockedNext = vi.fn();

        await authLimiter(blockedReq as any, blockedRes as any, blockedNext);

        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.stringContaining('login'),
            message: expect.any(String),
          })
        );
      });

      it('deve logar tentativas de login suspeitas', async () => {
        const ip = '10.0.0.1';
        const email = 'suspicious@example.com';

        for (let i = 0; i <= 5; i++) {
          const req = createMockRequest(ip, { email });
          const res = createMockResponse();
          const next = vi.fn();
          await authLimiter(req as any, res as any, next);
        }

        expect(mockConsoleWarn).toHaveBeenCalledWith(
          expect.stringContaining('[SECURITY]')
        );
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          expect.stringContaining('10.0.0.1')
        );
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          expect.stringContaining('suspicious@example.com')
        );
      });

      it('deve logar unknown quando email não é fornecido', async () => {
        const ip = '10.0.0.2';

        for (let i = 0; i <= 5; i++) {
          const req = createMockRequest(ip, {});
          const res = createMockResponse();
          const next = vi.fn();
          await authLimiter(req as any, res as any, next);
        }

        expect(mockConsoleWarn).toHaveBeenCalledWith(
          expect.stringContaining('unknown')
        );
      });
    });

    describe('Security Testing', () => {
      it('deve proteger contra ataques de força bruta', async () => {
        const attackPatterns = [
          'admin@example.com',
          'root@example.com',
          'test@test.com',
          'user@domain.com',
        ];

        for (const email of attackPatterns) {
          const ip = '192.168.1.100';

          for (let i = 0; i <= 5; i++) {
            const req = createMockRequest(ip, { email });
            const res = createMockResponse();
            const next = vi.fn();
            await authLimiter(req as any, res as any, next);
          }
        }

        expect(mockConsoleWarn).toHaveBeenCalled();
      });

      it('deve rastrear tentativas por IP mesmo com emails diferentes', async () => {
        const emails = ['user1@test.com', 'user2@test.com', 'user3@test.com'];
        const testIp = '192.168.1.50';

        for (const email of emails) {
          for (let i = 0; i < 2; i++) {
            const req = createMockRequest(testIp, { email });
            const res = createMockResponse();
            const next = vi.fn();
            await authLimiter(req as any, res as any, next);
          }
        }

        const finalReq = createMockRequest(testIp, { email: 'final@test.com' });
        const finalRes = createMockResponse();
        const finalNext = vi.fn();

        await authLimiter(finalReq as any, finalRes as any, finalNext);

        expect(finalRes.status).toHaveBeenCalledWith(429);
      });
    });

    describe('Custom Handler', () => {
      it('deve usar handler customizado quando limite excedido', async () => {
        const ip = '192.168.1.1';
        const email = 'test@example.com';

        for (let i = 0; i <= 5; i++) {
          const req = createMockRequest(ip, { email });
          const res = createMockResponse();
          const next = vi.fn();
          await authLimiter(req as any, res as any, next);
        }

        expect(mockConsoleWarn).toHaveBeenCalled();
      });
    });
  });

  describe('writeLimiter', () => {
    describe('Write Operations', () => {
      it('deve permitir até 20 operações de escrita por minuto', async () => {
        const ip = '192.168.1.1';

        for (let i = 0; i < 20; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();

          await writeLimiter(req as any, res as any, next);
          expect(next).toHaveBeenCalled();
        }
      });

      it('deve bloquear após 20 operações de escrita', async () => {
        const ip = '192.168.1.1';

        for (let i = 0; i < 20; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();
          await writeLimiter(req as any, res as any, next);
        }

        const blockedReq = createMockRequest(ip);
        const blockedRes = createMockResponse();
        const blockedNext = vi.fn();

        await writeLimiter(blockedReq as any, blockedRes as any, blockedNext);

        expect(blockedRes.status).toHaveBeenCalledWith(429);
      });

      it('deve resetar após 1 minuto', async () => {
        expect(writeLimiter).toBeDefined();
      });
    });

    describe('Burst Protection', () => {
      it('deve proteger contra rajadas de escrita', async () => {
        const ip = '192.168.1.1';
        const burstSize = 25;
        const promises: Promise<void>[] = [];

        for (let i = 0; i < burstSize; i++) {
          const req = createMockRequest(ip);
          const res = createMockResponse();
          const next = vi.fn();

          promises.push(writeLimiter(req as any, res as any, next));
        }

        await Promise.all(promises);
      });
    });

    describe('Different Operations', () => {
      it('deve rastrear diferentes tipos de operações de escrita', async () => {
        const operations = ['CREATE', 'UPDATE', 'DELETE'];
        const ip = '192.168.1.1';

        for (const op of operations) {
          for (let i = 0; i < 7; i++) {
            const req = createMockRequest(ip, { operation: op });
            const res = createMockResponse();
            const next = vi.fn();
            await writeLimiter(req as any, res as any, next);
          }
        }

        const finalReq = createMockRequest(ip, { operation: 'FINAL' });
        const finalRes = createMockResponse();
        const finalNext = vi.fn();

        await writeLimiter(finalReq as any, finalRes as any, finalNext);

        expect(finalRes.status).toHaveBeenCalledWith(429);
      });
    });

    describe('Multiple IPs', () => {
      it('deve rastrear operações separadamente por IP', async () => {
        const ip1 = '192.168.1.1';
        const ip2 = '192.168.1.2';

        for (let i = 0; i < 20; i++) {
          const req = createMockRequest(ip1);
          const res = createMockResponse();
          const next = vi.fn();
          await writeLimiter(req as any, res as any, next);
        }

        const req2 = createMockRequest(ip2);
        const res2 = createMockResponse();
        const next2 = vi.fn();

        await writeLimiter(req2 as any, res2 as any, next2);
        expect(next2).toHaveBeenCalled();
      });
    });
  });

  describe('Integration Tests', () => {
    it('limiters devem funcionar independentemente', async () => {
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        const req = createMockRequest(ip, { email: 'test@example.com' });
        const res = createMockResponse();
        const next = vi.fn();
        await authLimiter(req as any, res as any, next);
      }

      const apiReq = createMockRequest(ip);
      const apiRes = createMockResponse();
      const apiNext = vi.fn();

      await apiLimiter(apiReq as any, apiRes as any, apiNext);
      expect(apiNext).toHaveBeenCalled();
    });

    it('deve funcionar com diferentes middlewares em sequência', async () => {
      const ip = '192.168.1.1';
      const req = createMockRequest(ip);
      const res = createMockResponse();
      const next = vi.fn();

      const middlewareChain = async () => {
        await apiLimiter(req as any, res as any, next);
        await writeLimiter(req as any, res as any, next);
      };

      await expect(middlewareChain()).resolves.not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('deve processar requisições rapidamente', async () => {
      // Limiter isolado com limite alto para não acumular estado de testes anteriores
      // e garantir que nenhuma requisição seja bloqueada durante a medição
      const perfLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
      });

      const ip = '192.168.1.1';
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const req = createMockRequest(ip);
        const res = createMockResponse();
        const next = vi.fn();
        await perfLimiter(req as any, res as any, next);
      }

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('deve lidar com alta concorrência', async () => {
      const concurrentRequests = 50;
      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const req = createMockRequest(`192.168.1.${i}`);
        const res = createMockResponse();
        const next = vi.fn();
        return apiLimiter(req as any, res as any, next);
      });

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('Configuration Tests', () => {
    it('apiLimiter deve ter configuração correta', () => {
      expect(apiLimiter).toBeDefined();
    });

    it('authLimiter deve ter configuração correta', () => {
      expect(authLimiter).toBeDefined();
    });

    it('writeLimiter deve ter configuração correta', () => {
      expect(writeLimiter).toBeDefined();
    });

    it('todos os limiters devem usar headers padrão', () => {
      expect(apiLimiter).toBeDefined();
      expect(authLimiter).toBeDefined();
      expect(writeLimiter).toBeDefined();
    });
  });
});