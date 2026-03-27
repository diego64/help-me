import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '@shared/config/logger';

/**
 * URLs que não devem ser logadas para reduzir ruído
 * Inspirado em: AWS ALB health check filtering, Datadog APM
 */
const SKIP_LOG_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/favicon.ico',
]);

/**
 * Campos sensíveis que nunca devem aparecer nos logs
 * Inspirado em: GDPR compliance, PCI-DSS requirements
 */
const SENSITIVE_BODY_FIELDS = new Set([
  'password',
  'senha',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'cvv',
  'cpf',
]);

/**
 * Tamanho máximo do body logado em caracteres
 * Previne logs gigantes que causam DoS no sistema de observabilidade
 */
const MAX_BODY_LOG_SIZE = 2000;

/**
 * Extrai IP real do cliente considerando proxies e load balancers
 * Ordem de prioridade: X-Forwarded-For → X-Real-IP → socket
 * Inspirado em: Cloudflare CF-Connecting-IP, AWS ELB headers
 */
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Sanitiza o body da requisição para logging seguro
 * Redige campos sensíveis e trunca bodies grandes
 * Inspirado em: OWASP logging guidelines, Stripe log sanitization
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;

  const bodyStr = JSON.stringify(body);

  // Trunca bodies grandes para não sobrecarregar o sistema de logs
  if (bodyStr.length > MAX_BODY_LOG_SIZE) {
    return {
      _truncated: true,
      _originalSize: bodyStr.length,
      _message: 'Body too large for logging',
    };
  }

  // Redige campos sensíveis recursivamente
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_BODY_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Determina o nível de log baseado no status code
 * Inspirado em: Netflix Hysterix logging, AWS CloudWatch log levels
 *
 * - 5xx: error (problema no servidor — equipe precisa agir)
 * - 4xx: warn (problema no cliente — monitorar padrões)
 * - 3xx/2xx: info (sucesso — ruído baixo)
 */
function getLogLevel(statusCode: number): 'error' | 'warn' | 'info' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Determina se a requisição deve ser logada
 * Bypassa health checks e endpoints de métricas para reduzir ruído
 * Inspirado em: Datadog APM filtering, AWS ALB access logs
 */
function shouldSkipLogging(req: Request): boolean {
  return SKIP_LOG_PATHS.has(req.path);
}

/**
 * Middleware de logging de requisições HTTP
 *
 * Funcionalidades:
 * - Request ID único por requisição (rastreabilidade)
 * - Logger contextual no req.log (herda requestId automaticamente)
 * - Log de entrada com método, URL, IP e user agent
 * - Log de saída com status code e duração
 * - Sanitização automática de dados sensíveis no body
 * - Skip automático em health checks e endpoints de métricas
 * - Nível de log dinâmico baseado no status code
 *
 * Inspirado em: Netflix Prana, AWS X-Ray, Datadog APM
 *
 * @example
 * // Registrar no Express:
 * app.use(requestLoggerMiddleware);
 *
 * // Usar o logger contextual nas rotas:
 * app.get('/usuarios/:id', (req, res) => {
 *   req.log.info({ usuarioId: req.params.id }, 'Buscando usuário');
 *   res.json({ usuario });
 * });
 */
export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Bypassa logging para endpoints de infraestrutura
  if (shouldSkipLogging(req)) {
    return next();
  }

  // Correlation ID
  // Reutiliza correlation ID se vier de outro serviço (propagação entre microserviços)
  // Gera um novo se não existir — garante rastreabilidade ponta a ponta
  // Inspirado em: AWS X-Ray trace IDs, Google Cloud Trace
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    randomUUID();

  // Request ID
  // ID único desta requisição específica (diferente do correlation ID
  // que pode ser o mesmo ao longo de uma cadeia de microserviços)
  const requestId = randomUUID();

  req.id = requestId;

  // Propaga correlation ID para outros serviços via headers de resposta
  // Permite rastrear a requisição original mesmo em chamadas subsequentes
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);

  // Logger Contextual
  // Child logger que herda requestId e userId automaticamente
  // Todos os logs da requisição terão esses campos sem precisar passar manualmente
  // Inspirado em: Pino child loggers, Datadog correlation
  req.log = logger.child({
    requestId,
    correlationId,
    // Inclui userId se o usuário já estiver autenticado (ex: middleware de auth rodou antes)
    ...((req as Request & { usuario?: { id: string } }).usuario?.id && {
      userId: (req as Request & { usuario?: { id: string } }).usuario?.id,
    }),
  });

  const startTime = Date.now();
  const ip = getClientIp(req);

  // Log de Entrada
  // Registra a requisição ao chegar — antes de qualquer processamento
  // Inclui apenas dados seguros (sem body por padrão em GET/DELETE)
  req.log.info(
    {
      method: req.method,
      url: req.url,
      path: req.path,
      ip,
      userAgent: req.get('user-agent'),
      // Query params apenas se existirem — reduz ruído
      ...(Object.keys(req.query).length > 0 && { query: req.query }),
      ...(Object.keys(req.params).length > 0 && { params: req.params }),
      // Body sanitizado apenas em operações de escrita (POST, PUT, PATCH)
      // GET e DELETE não têm body relevante
      ...(['POST', 'PUT', 'PATCH'].includes(req.method) && {
        body: sanitizeBody(req.body),
      }),
    },
    '→ Incoming request'
  );

  // Log de Saída via res.json
  // Intercepta res.json para capturar o momento exato do envio da resposta
  // Mais preciso que res.on('finish') pois captura antes da serialização
  // Inspirado em: Express morgan, pino-http response logging
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const duration = Date.now() - startTime;
    const level = getLogLevel(res.statusCode);

    // Log com nível dinâmico baseado no status code
    req.log[level](
      {
        statusCode: res.statusCode,
        duration,
        // Tamanho da resposta em bytes para monitoramento de performance
        responseSize: JSON.stringify(body)?.length ?? 0,
      },
      `← Request completed [${res.statusCode}] ${duration}ms`
    );

    return originalJson(body);
  };

  // Log de Saída via res.on('finish')
  // Fallback para requisições que não usam res.json
  // Ex: streams, res.send, res.end
  // Evita log duplicado verificando se já foi logado via res.json
  let loggedViaJson = false;
  const originalJsonCheck = res.json.bind(res);
  res.json = function (body: unknown) {
    loggedViaJson = true;
    return originalJsonCheck(body);
  };

  res.on('finish', () => {
    if (loggedViaJson) return; // Já logado via res.json

    const duration = Date.now() - startTime;
    const level = getLogLevel(res.statusCode);

    req.log[level](
      {
        statusCode: res.statusCode,
        duration,
      },
      `← Request finished [${res.statusCode}] ${duration}ms`
    );
  });

  // Alertas de Performance
  // Detecta requisições lentas — importante para SLA monitoring
  // Inspirado em: Datadog APM slow query detection, New Relic
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const SLOW_REQUEST_THRESHOLD_MS = 2000; // 2 segundos

    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      req.log.warn(
        {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
          ip,
          threshold: SLOW_REQUEST_THRESHOLD_MS,
        },
        '[PERFORMANCE] Requisição lenta detectada'
      );
    }
  });

  next();
};