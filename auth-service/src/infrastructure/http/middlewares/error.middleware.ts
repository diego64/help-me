import { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/config/logger';

/**
 * Interface de erro padrão seguindo RFC 7807 (Problem Details for HTTP APIs)
 * @see https://www.rfc-editor.org/rfc/rfc7807
 *
 * Inspirado em: Stripe, GitHub e AWS que usam este padrão para
 * respostas de erro consistentes e machine-readable
 */
export interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: Record<string, unknown>;
  timestamp?: string;
  requestId?: string;
}

/**
 * CONFIGURAÇÃO DE SANITIZAÇÃO
 * Campos sensíveis que NUNCA devem aparecer nos logs
 * Inspirado em: GDPR compliance, PCI-DSS requirements
 */

const SENSITIVE_FIELDS = [
  'password',
  'senha',
  'token',
  'access_token',
  'refresh_token',
  'refreshToken',
  'accessToken',
  'secret',
  'api_key',
  'apiKey',
  'authorization',
  'credit_card',
  'creditCard',
  'cvv',
  'ssn',
  'cpf',
  'rg',
] as const;

const REDACTED_VALUE = '[REDACTED]';
const MAX_BODY_LOG_SIZE = 10000; // Previne logs gigantes que causam DoS no sistema de logs
const MAX_STACK_TRACE_LINES = 15; // Mantém stack traces úteis sem expor demais


/**
 * Middleware de logging de erros
 * Registra erros com contexto sanitizado da requisição
 *
 * Funcionalidades:
 * - Redação automática de PII e dados sensíveis
 * - Rastreamento por correlation ID
 * - Logging estruturado para observabilidade
 * - Monitoramento de performance
 * - Categorização de erros (operacional vs programação)
 *
 * Inspirado em: Netflix observability practices, AWS CloudWatch patterns
 */
export const errorLoggerMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Usa o logger específico da requisição (pino-http) se disponível,
  // caso contrário usa o logger global
  const requestLogger = req.log || logger;
  const timestamp = new Date().toISOString();

  // Recupera ou gera correlation ID para rastreabilidade entre serviços
  // Inspirado em: AWS X-Ray, Google Cloud Trace
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    generateCorrelationId();

  // Enriquece o erro com metadados de rastreabilidade
  err.requestId = correlationId;
  err.timestamp = timestamp;

  const severity = determineErrorSeverity(err);

  // Contexto completo do erro — tudo que o time de on-call precisa para debugar
  const errorContext = {
    error: {
      message: err.message,
      name: err.name,
      code: err.code || 'UNKNOWN_ERROR',
      status: err.status || err.statusCode || 500,
      isOperational: err.isOperational ?? false,
      stack: sanitizeStackTrace(err.stack),
      details: err.details,
    },

    // Contexto da requisição com dados sensíveis sanitizados
    request: {
      id: correlationId,
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      path: req.path,
      query: sanitizeObject(req.query),
      params: sanitizeObject(req.params),
      body: sanitizeBody(req.body),
      headers: sanitizeHeaders(req.headers),
      ip: getClientIp(req),
      userAgent: req.get('user-agent'),
    },

    // Contexto do usuário autenticado (sem PII desnecessária)
    usuario: extractUserContext(req),

    // Métricas de performance da requisição
    timing: {
      timestamp,
      duration: calculateRequestDuration(req),
    },

    environment: process.env.NODE_ENV || 'development',
    service: 'auth-service',
    version: process.env.APP_VERSION || '1.0.0',
  };

  logError(requestLogger, severity, errorContext);

  // Passa para o próximo error handler (errorResponseMiddleware)
  next(err);
};

/**
 * Determina a severidade do erro baseado no status code e tipo
 *
 * - fatal: erros 5xx ou erros de programação (não operacionais)
 * - warn: erros 4xx (erros do cliente, esperados)
 * - error: outros casos
 */
function determineErrorSeverity(err: AppError): 'fatal' | 'error' | 'warn' {
  const statusCode = err.status || err.statusCode || 500;

  if (statusCode >= 500) return 'fatal';
  if (err.isOperational === false) return 'fatal'; // Erros de programação são sempre fatais
  if (statusCode >= 400 && statusCode < 500) return 'warn';

  return 'error';
}

/**
 * Despacha o log para o nível correto do Pino
 * Mantém consistência com os níveis de severidade definidos acima
 */
function logError(
  log: typeof logger,
  severity: 'fatal' | 'error' | 'warn',
  context: unknown
): void {
  const ctx = context as { request: { method: string; path: string }; error: { message: string } };
  const message = `${ctx.request.method} ${ctx.request.path} - ${ctx.error.message}`;

  switch (severity) {
    case 'fatal': log.fatal(context, message); break;
    case 'error': log.error(context, message); break;
    case 'warn':  log.warn(context, message);  break;
  }
}

/**
 * Sanitiza o body da requisição para logging
 * Trunca bodies grandes para prevenir DoS no sistema de logs
 * Redige campos sensíveis via sanitizeObject
 */
function sanitizeBody(body: unknown): unknown {
  if (!body) return body;

  const bodyString = JSON.stringify(body);
  if (bodyString.length > MAX_BODY_LOG_SIZE) {
    return {
      _truncated: true,
      _originalSize: bodyString.length,
      _message: 'Body too large for logging',
    };
  }

  return sanitizeObject(body);
}

/**
 * Sanitiza recursivamente um objeto redindo campos sensíveis
 * Suporta objetos aninhados e arrays
 *
 * Inspirado em: OWASP logging guidelines
 */
function sanitizeObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      keyLower.includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = REDACTED_VALUE;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitiza headers HTTP para logging
 * Inclui apenas headers relevantes e redige o Authorization
 *
 * Estratégia: whitelist de headers permitidos + redação do token
 * mantendo o tipo (Bearer, Basic) para diagnóstico
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  // Whitelist de headers seguros para logar
  const headersToInclude = [
    'content-type',
    'content-length',
    'user-agent',
    'accept',
    'accept-encoding',
    'accept-language',
    'host',
    'referer',
    'origin',
  ];

  for (const header of headersToInclude) {
    const value = headers[header];
    if (value) sanitized[header] = String(value);
  }

  // Mantém o tipo de autenticação mas redige o token
  // Ex: "Bearer [REDACTED]" — útil para diagnóstico sem expor credenciais
  if (headers.authorization) {
    const authType = String(headers.authorization).split(' ')[0];
    sanitized.authorization = `${authType} ${REDACTED_VALUE}`;
  }

  // IDs de rastreabilidade são seguros para logar
  if (headers['x-correlation-id']) sanitized['x-correlation-id'] = String(headers['x-correlation-id']);
  if (headers['x-request-id'])     sanitized['x-request-id']     = String(headers['x-request-id']);

  return sanitized;
}

/**
 * Sanitiza a URL removendo parâmetros sensíveis da query string
 * Ex: /reset-password?token=abc123 → /reset-password?token=[REDACTED]
 */
function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'api_key'];

    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, REDACTED_VALUE);
      }
    }

    return urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

/**
 * Sanitiza stack traces para logging
 * Remove caminhos absolutos do filesystem (expõem estrutura do servidor)
 * Limita o número de linhas para evitar logs gigantes
 */
function sanitizeStackTrace(stack?: string): string[] | undefined {
  if (!stack) return undefined;

  return stack
    .split('\n')
    .slice(0, MAX_STACK_TRACE_LINES)
    .map(line => line.replace(/\/.*?\/(src|dist|node_modules)/g, '$1'));
}

/**
 * Extrai contexto do usuário autenticado para o log
 * Inclui apenas id, email e regra — sem PII desnecessária como nome completo
 */
function extractUserContext(req: Request): Record<string, unknown> | undefined {
  const usuario = (req as Request & { usuario?: { id: string; email: string; regra: string } }).usuario;

  if (!usuario) return undefined;

  return {
    id: usuario.id,
    email: usuario.email,
    regra: usuario.regra,
  };
}

/**
 * Extrai o IP real do cliente considerando proxies e load balancers
 * Ordem de prioridade: X-Forwarded-For → X-Real-IP → socket.remoteAddress
 */
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string) ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Calcula a duração total da requisição em ms
 * Requer que o requestTimingMiddleware tenha sido executado antes
 */
function calculateRequestDuration(req: Request): number | undefined {
  const startTime = (req as Request & { startTime?: number }).startTime;
  if (!startTime) return undefined;
  return Date.now() - startTime;
}

/**
 * Gera um correlation ID único para rastreabilidade
 * Usado quando a requisição não traz X-Correlation-ID ou X-Request-ID
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Middleware de resposta de erros
 * Envia respostas padronizadas RFC 7807 para o cliente
 *
 * Estratégia de exposição de informações:
 * - Produção: apenas message, status, type e requestId
 * - Desenvolvimento: inclui stack trace e details para facilitar debug
 *
 * Inspirado em: Stripe API error format, GitHub API errors
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export const errorResponseMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Evita enviar resposta dupla se headers já foram enviados
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Estrutura RFC 7807 — machine-readable error response
  const errorResponse: Record<string, unknown> = {
    type: getErrorType(statusCode),       // URI identificando o tipo de problema
    title: getErrorTitle(statusCode),     // Descrição human-readable do tipo
    status: statusCode,                   // HTTP status code
    detail: err.message,                  // Descrição específica do problema
    instance: req.originalUrl || req.url, // URI da requisição que gerou o erro
    timestamp: err.timestamp || new Date().toISOString(),
  };

  // Adiciona requestId para correlação com logs
  if (err.requestId) {
    errorResponse['requestId'] = err.requestId;
    res.setHeader('X-Request-ID', err.requestId);
  }

  if (err.code) errorResponse['code'] = err.code;

  // Em desenvolvimento, expõe detalhes extras para facilitar debug
  if (!isProduction) {
    errorResponse['stack'] = err.stack;
    errorResponse['details'] = err.details;
  }

  // Expõe erros de validação se presentes (útil para o cliente)
  if (err.details?.['errors']) {
    errorResponse['errors'] = err.details['errors'];
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Retorna URI do tipo de erro para RFC 7807
 * URIs descritivas ajudam clientes a identificar e tratar erros programaticamente
 */
function getErrorType(statusCode: number): string {
  const baseUrl = 'https://helpme.com/errors';

  switch (statusCode) {
    case 400: return `${baseUrl}/bad-request`;
    case 401: return `${baseUrl}/unauthorized`;
    case 403: return `${baseUrl}/forbidden`;
    case 404: return `${baseUrl}/not-found`;
    case 409: return `${baseUrl}/conflict`;
    case 422: return `${baseUrl}/validation-error`;
    case 429: return `${baseUrl}/rate-limit`;
    case 500: return `${baseUrl}/internal-error`;
    case 503: return `${baseUrl}/service-unavailable`;
    default:  return `${baseUrl}/error`;
  }
}

function getErrorTitle(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 409: return 'Conflict';
    case 422: return 'Validation Error';
    case 429: return 'Too Many Requests';
    case 500: return 'Internal Server Error';
    case 503: return 'Service Unavailable';
    default:  return 'Error';
  }
}

/**
 * Registra o timestamp de início da requisição
 * Deve ser o PRIMEIRO middleware registrado no Express
 * para que calculateRequestDuration funcione corretamente
 */
export const requestTimingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  (req as Request & { startTime: number }).startTime = Date.now();
  next();
};

/**
 * Garante que toda requisição tenha um correlation ID
 * Propaga o ID entre serviços via headers
 *
 * Inspirado em: AWS X-Ray, Google Cloud Trace, Datadog APM
 * Permite rastrear uma requisição através de múltiplos microserviços
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Preserva o correlation ID se vier de outro serviço (propagação)
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    generateCorrelationId();

  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};

/**
 * CUSTOM ERROR CLASSES
 * Hierarquia de erros operacionais para uso nos use-cases e rotas
 * Inspirado em: Node.js best practices, Stripe error handling
 */

/**
 * Classe base para erros operacionais (esperados, tratáveis)
 * Diferente de erros de programação (bugs) que são sempre fatais
 *
 * isOperational = true → o processo NÃO deve ser reiniciado
 * isOperational = false → erro de programação, processo DEVE ser reiniciado
 */
export class OperationalError extends Error implements AppError {
  public readonly isOperational = true;
  public readonly timestamp: string;

  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — Dados da requisição inválidos ou malformados */
export class BadRequestError extends OperationalError {
  constructor(message = 'Bad Request', details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/** 401 — Não autenticado (sem token ou token inválido) */
export class UnauthorizedError extends OperationalError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/** 403 — Autenticado mas sem permissão para o recurso */
export class ForbiddenError extends OperationalError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/** 404 — Recurso não encontrado */
export class NotFoundError extends OperationalError {
  constructor(message = 'Not Found', details?: Record<string, unknown>) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/** 409 — Conflito de estado (ex: email já cadastrado) */
export class ConflictError extends OperationalError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
  }
}

/** 422 — Dados semanticamente inválidos (ex: senha fraca, formato de data errado) */
export class ValidationError extends OperationalError {
  constructor(message = 'Validation Error', details?: Record<string, unknown>) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

/** 429 — Rate limit excedido */
export class RateLimitError extends OperationalError {
  constructor(message = 'Too Many Requests', details?: Record<string, unknown>) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

/** 503 — Serviço temporariamente indisponível (ex: banco fora, Redis fora) */
export class ServiceUnavailableError extends OperationalError {
  constructor(message = 'Service Unavailable', details?: Record<string, unknown>) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}