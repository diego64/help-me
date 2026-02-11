import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestLoggerMiddleware } from '../../infrastructure/http/middlewares/request-logger.middleware';
import { logger } from '../../shared/config/logger';

const MOCK_REQUEST_ID = 'mock-request-id-12345';
const MOCK_USER_ID = 'user-abc-123';
const MOCK_IP = '203.0.113.42';
const MOCK_USER_AGENT = 'TestAgent/1.0';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => MOCK_REQUEST_ID),
}));

class RequestBuilder {
  private request: Partial<Request>;

  constructor() {
    this.request = {
      method: 'GET',
      url: '/api/test',
      query: {},
      params: {},
      get: vi.fn().mockReturnValue(MOCK_USER_AGENT),
    } as any;

    // Define 'ip' usando Object.defineProperty para evitar readonly error
    Object.defineProperty(this.request, 'ip', {
      value: MOCK_IP,
      writable: true,
      configurable: true,
    });
  }

  withMethod(method: string): this {
    this.request.method = method;
    return this;
  }

  withUrl(url: string): this {
    this.request.url = url;
    return this;
  }

  withUser(userId: string): this {
    this.request.user = { id: userId } as any;
    return this;
  }

  withQuery(query: Record<string, any>): this {
    this.request.query = query;
    return this;
  }

  withParams(params: Record<string, any>): this {
    this.request.params = params;
    return this;
  }

  withIp(ip: string): this {
    Object.defineProperty(this.request, 'ip', {
      value: ip,
      writable: true,
      configurable: true,
    });
    return this;
  }

  build(): Request {
    return this.request as Request;
  }
}

class ResponseBuilder {
  private response: Partial<Response>;

  constructor() {
    const jsonMock = vi.fn().mockReturnThis();
    this.response = {
      statusCode: 200,
      json: jsonMock as any, // Type assertion to avoid complex generic issues
      on: vi.fn(),
    };
  }

  withStatusCode(code: number): this {
    this.response.statusCode = code;
    return this;
  }

  withAutoFinish(): this {
    let finishCallback: Function;
    
    (this.response.on as any).mockImplementation((event: string, cb: Function) => {
      if (event === 'finish') finishCallback = cb;
    });

    const originalJson = this.response.json;
    this.response.json = vi.fn((...args) => {
      (originalJson as any)(...args);
      if (finishCallback) {
        // Simulate async finish event
        setTimeout(() => finishCallback(), 0);
      }
      // Return this for chaining
      return this.response;
    }) as any; // Type assertion for Express compatibility

    return this;
  }

  build(): Response {
    return this.response as Response;
  }
}

describe('Request Logger Middleware', () => {
  let infoMock: ReturnType<typeof vi.fn>;
  let warnMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup logger mocks
    infoMock = vi.fn();
    warnMock = vi.fn();
    errorMock = vi.fn();

    vi.spyOn(logger, 'child').mockReturnValue({
      info: infoMock,
      warn: warnMock,
      error: errorMock,
    } as any);

    next = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Functionality', () => {
    it('should generate unique request ID for traceability', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(req.id).toBe(MOCK_REQUEST_ID);
    });

    it('should create contextual logger with request metadata', () => {
      const req = new RequestBuilder()
        .withUser(MOCK_USER_ID)
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(logger.child).toHaveBeenCalledWith({
        requestId: MOCK_REQUEST_ID,
        userId: MOCK_USER_ID,
      });
    });

    it('should attach logger to request object for downstream use', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(req.log).toBeDefined();
      expect(req.log?.info).toBe(infoMock);
      expect(req.log?.warn).toBe(warnMock);
    });

    it('should call next() to continue middleware chain', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // No errors
    });
  });

  describe('Request Logging', () => {
    it('should log incoming request with essential metadata', () => {
      const req = new RequestBuilder()
        .withMethod('POST')
        .withUrl('/api/users')
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/users',
          userAgent: MOCK_USER_AGENT,
          ip: MOCK_IP,
        }),
        'Incoming request'
      );
    });

    it('should include query parameters when present', () => {
      const req = new RequestBuilder()
        .withQuery({ page: '1', limit: '50' })
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { page: '1', limit: '50' },
        }),
        'Incoming request'
      );
    });

    it('should include route parameters when present', () => {
      const req = new RequestBuilder()
        .withParams({ userId: '123', organizationId: 'org-456' })
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { userId: '123', organizationId: 'org-456' },
        }),
        'Incoming request'
      );
    });

    it('should omit query/params when empty to reduce log noise', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      const logCall = infoMock.mock.calls[0][0];
      expect(logCall).not.toHaveProperty('query');
      expect(logCall).not.toHaveProperty('params');
    });
  });

  describe('Response Tracking', () => {
    it('should log successful request completion with duration', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withStatusCode(200)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ success: true });

      // Wait for async finish event
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          duration: expect.any(Number),
        }),
        'Request completed'
      );
    });

    it('should measure request duration accurately', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withAutoFinish()
        .build();

      const startTime = Date.now();
      requestLoggerMiddleware(req, res, next);

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 5));

      res.json({ data: 'test' });
      await new Promise(resolve => setTimeout(resolve, 10));

      const completionLog = infoMock.mock.calls.find(
        call => call[1] === 'Request completed'
      );

      expect(completionLog).toBeDefined();
      expect(completionLog![0].duration).toBeGreaterThanOrEqual(0);
      expect(completionLog![0].duration).toBeLessThan(100);
    });

    it('should preserve res.json chaining behavior', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      const result = res.json({ test: true });

      expect(result).toBeDefined();
    });
  });

  describe('Error Status Handling', () => {
    it('should warn on 4xx client errors', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withStatusCode(400)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ error: 'Bad Request' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          duration: expect.any(Number),
        }),
        'Request finished with error status'
      );
    });

    it('should warn on 5xx server errors', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withStatusCode(500)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ error: 'Internal Server Error' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        'Request finished with error status'
      );
    });

    it('should NOT warn on 2xx success codes', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withStatusCode(201)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ created: true });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(warnMock).not.toHaveBeenCalled();
    });

    it('should NOT warn on 3xx redirect codes', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withStatusCode(302)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ redirect: '/login' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(warnMock).not.toHaveBeenCalled();
    });

    // Test specific error codes that matter operationally
    const criticalErrorCodes = [
      { code: 401, reason: 'Unauthorized - auth failure' },
      { code: 403, reason: 'Forbidden - permission denied' },
      { code: 404, reason: 'Not Found - routing issue' },
      { code: 429, reason: 'Rate Limited - throttling active' },
      { code: 500, reason: 'Internal Error - service degraded' },
      { code: 502, reason: 'Bad Gateway - upstream failure' },
      { code: 503, reason: 'Service Unavailable - overload' },
      { code: 504, reason: 'Gateway Timeout - upstream slow' },
    ];

    criticalErrorCodes.forEach(({ code, reason }) => {
      it(`should track ${code} errors for operational alerts (${reason})`, async () => {
        const req = new RequestBuilder().build();
        const res = new ResponseBuilder()
          .withStatusCode(code)
          .withAutoFinish()
          .build();

        requestLoggerMiddleware(req, res, next);

        res.json({ error: reason });
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(warnMock).toHaveBeenCalledWith(
          expect.objectContaining({ statusCode: code }),
          'Request finished with error status'
        );
      });
    });
  });

  describe('User Context Propagation', () => {
    it('should include userId in logger context when authenticated', () => {
      const req = new RequestBuilder()
        .withUser('user-xyz-789')
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(logger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-xyz-789',
        })
      );
    });

    it('should exclude userId when request is unauthenticated', () => {
      const req = new RequestBuilder().build(); // No user
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(logger.child).toHaveBeenCalledWith({
        requestId: MOCK_REQUEST_ID,
        // userId should NOT be present
      });
    });

    it('should maintain separate contexts for concurrent requests', () => {
      const req1 = new RequestBuilder().withUser('user-1').build();
      const req2 = new RequestBuilder().withUser('user-2').build();
      const res1 = new ResponseBuilder().build();
      const res2 = new ResponseBuilder().build();

      requestLoggerMiddleware(req1, res1, next);
      requestLoggerMiddleware(req2, res2, next);

      // Each request gets its own logger instance
      expect(logger.child).toHaveBeenCalledTimes(2);
      expect(req1.log).toBeDefined();
      expect(req2.log).toBeDefined();
      
      // Verify each got the correct userId
      expect(logger.child).toHaveBeenNthCalledWith(1, expect.objectContaining({
        userId: 'user-1',
      }));
      expect(logger.child).toHaveBeenNthCalledWith(2, expect.objectContaining({
        userId: 'user-2',
      }));
    });
  });

  describe('Security & Privacy', () => {
    it('should NOT log request body (may contain PII/credentials)', () => {
      const req = new RequestBuilder().build();
      (req as any).body = {
        password: 'super-secret',
        creditCard: '4111-1111-1111-1111',
        ssn: '123-45-6789',
      };
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      const incomingLog = infoMock.mock.calls.find(
        call => call[1] === 'Incoming request'
      );

      expect(incomingLog![0]).not.toHaveProperty('body');
    });

    it('should NOT log response body (may contain sensitive data)', async () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder()
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({
        user: {
          email: 'sensitive@example.com',
          apiKey: 'sk_live_secret',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const completionLog = infoMock.mock.calls.find(
        call => call[1] === 'Request completed'
      );

      expect(completionLog![0]).not.toHaveProperty('body');
      expect(completionLog![0]).not.toHaveProperty('responseBody');
    });
  });

  describe('HTTP Method Support', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    methods.forEach(method => {
      it(`should handle ${method} requests correctly`, () => {
        const req = new RequestBuilder()
          .withMethod(method)
          .build();
        const res = new ResponseBuilder().build();

        requestLoggerMiddleware(req, res, next);

        expect(infoMock).toHaveBeenCalledWith(
          expect.objectContaining({ method }),
          'Incoming request'
        );
      });
    });
  });

  describe('Edge Cases & Resilience', () => {
    it('should handle very long URLs without breaking', () => {
      const longUrl = '/api/endpoint?' + 'param=value&'.repeat(500);
      const req = new RequestBuilder()
        .withUrl(longUrl)
        .build();
      const res = new ResponseBuilder().build();

      expect(() => {
        requestLoggerMiddleware(req, res, next);
      }).not.toThrow();

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({ url: longUrl }),
        'Incoming request'
      );
    });

    it('should handle missing user-agent gracefully', () => {
      const req = new RequestBuilder().build();
      (req.get as any).mockReturnValue(undefined);
      const res = new ResponseBuilder().build();

      expect(() => {
        requestLoggerMiddleware(req, res, next);
      }).not.toThrow();
    });

    it('should handle IPv6 addresses correctly', () => {
      const req = new RequestBuilder()
        .withIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')
        .build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        }),
        'Incoming request'
      );
    });

    it('should register finish listener only once per request', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      requestLoggerMiddleware(req, res, next);

      expect(res.on).toHaveBeenCalledTimes(1);
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });

  describe('Performance Characteristics', () => {
    it('should execute synchronously without blocking', () => {
      const req = new RequestBuilder().build();
      const res = new ResponseBuilder().build();

      const startTime = performance.now();
      requestLoggerMiddleware(req, res, next);
      const endTime = performance.now();

      // Should complete in less than 10ms
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should handle high concurrency without interference', () => {
      const requests = Array.from({ length: 100 }, (_, i) => ({
        req: new RequestBuilder()
          .withUrl(`/api/endpoint-${i}`)
          .build(),
        res: new ResponseBuilder().build(),
      }));

      requests.forEach(({ req, res }) => {
        requestLoggerMiddleware(req, res, next);
      });

      expect(next).toHaveBeenCalledTimes(100);
      expect(logger.child).toHaveBeenCalledTimes(100);
    });
  });

  describe('Integration Scenarios', () => {
    it('should log complete lifecycle: request → processing → success', async () => {
      const req = new RequestBuilder()
        .withMethod('POST')
        .withUrl('/api/orders')
        .withUser('customer-123')
        .withQuery({ coupon: 'SAVE20' })
        .build();
      const res = new ResponseBuilder()
        .withStatusCode(201)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      // Incoming request should be logged
      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/orders',
          query: { coupon: 'SAVE20' },
        }),
        'Incoming request'
      );

      // Simulate response
      res.json({ orderId: 'order-456' });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Completion should be logged
      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 201,
          duration: expect.any(Number),
        }),
        'Request completed'
      );
    });

    it('should log complete lifecycle: request → processing → error', async () => {
      const req = new RequestBuilder()
        .withMethod('DELETE')
        .withUrl('/api/users/999')
        .build();
      const res = new ResponseBuilder()
        .withStatusCode(404)
        .withAutoFinish()
        .build();

      requestLoggerMiddleware(req, res, next);

      res.json({ error: 'User not found' });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should log both incoming request and error status
      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE' }),
        'Incoming request'
      );

      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
        'Request finished with error status'
      );
    });
  });
});