import { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/config/logger';

/**
 * Standard error interface following industry best practices
 * @see https://www.rfc-editor.org/rfc/rfc7807 (Problem Details for HTTP APIs)
 */
export interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: Record<string, any>;
  timestamp?: string;
  requestId?: string;
}

// Sanitization configuration
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
const MAX_BODY_LOG_SIZE = 10000; // Characters
const MAX_STACK_TRACE_LINES = 15;

/**
 * Error logging middleware
 * Logs errors with sanitized request context following observability best practices
 * 
 * Features:
 * - Automatic PII/sensitive data redaction
 * - Request correlation tracking
 * - Structured logging for better observability
 * - Performance impact monitoring
 * - Error categorization (operational vs programming)
 * 
 * @param err - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export const errorLoggerMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestLogger = req.log || logger;
  const timestamp = new Date().toISOString();
  
  // Generate or retrieve correlation ID for request tracking
  const correlationId = req.headers['x-correlation-id'] as string || 
                        req.headers['x-request-id'] as string ||
                        generateCorrelationId();
  
  // Attach correlation ID to error for upstream handling
  err.requestId = correlationId;
  err.timestamp = timestamp;

  // Determine error severity based on status code and type
  const severity = determineErrorSeverity(err);
  
  // Build comprehensive error context
  const errorContext = {
    // Error metadata
    error: {
      message: err.message,
      name: err.name,
      code: err.code || 'UNKNOWN_ERROR',
      status: err.status || err.statusCode || 500,
      isOperational: err.isOperational ?? false,
      stack: sanitizeStackTrace(err.stack),
      details: err.details,
    },
    
    // Request metadata
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
    
    // User context (if authenticated)
    user: extractUserContext(req),
    
    // Performance metrics
    timing: {
      timestamp,
      duration: calculateRequestDuration(req),
    },
    
    // Additional context
    environment: process.env.NODE_ENV || 'development',
    service: 'helpdesk-api',
    version: process.env.APP_VERSION || '1.0.0',
  };

  // Log based on severity
  logError(requestLogger, severity, errorContext);

  // Pass to next error handler
  next(err);
};

 // Determines error severity based on status code and error type
function determineErrorSeverity(err: AppError): 'fatal' | 'error' | 'warn' {
  const statusCode = err.status || err.statusCode || 500;
  
  // 5xx errors are more severe
  if (statusCode >= 500) {
    return 'fatal';
  }
  
  // Non-operational errors are critical (programming errors)
  if (err.isOperational === false) {
    return 'fatal';
  }
  
  // 4xx client errors are warnings
  if (statusCode >= 400 && statusCode < 500) {
    return 'warn';
  }
  
  return 'error';
}

function logError(
  logger: any,
  severity: 'fatal' | 'error' | 'warn',
  context: any
): void {
  const message = `${context.request.method} ${context.request.path} - ${context.error.message}`;
  
  switch (severity) {
    case 'fatal':
      logger.fatal(context, message);
      break;
    case 'error':
      logger.error(context, message);
      break;
    case 'warn':
      logger.warn(context, message);
      break;
  }
}

function sanitizeBody(body: any): any {
  if (!body) {
    return body;
  }

  // Limit body size for logging
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

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Check if field is sensitive
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

// Sanitizes HTTP headers, redacting sensitive values
function sanitizeHeaders(headers: any): Record<string, string> {
  const sanitized: Record<string, string> = {};
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
    if (value) {
      sanitized[header] = String(value);
    }
  }

  // Redact authorization header but show type
  if (headers.authorization) {
    const authType = headers.authorization.split(' ')[0];
    sanitized.authorization = `${authType} ${REDACTED_VALUE}`;
  }

  // Include correlation/request IDs
  if (headers['x-correlation-id']) {
    sanitized['x-correlation-id'] = headers['x-correlation-id'];
  }
  if (headers['x-request-id']) {
    sanitized['x-request-id'] = headers['x-request-id'];
  }

  return sanitized;
}

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

function sanitizeStackTrace(stack?: string): string[] | undefined {
  if (!stack) {
    return undefined;
  }

  const lines = stack.split('\n').slice(0, MAX_STACK_TRACE_LINES);
  
  return lines.map(line => {
    // Remove absolute file paths, keep relative paths
    return line.replace(/\/.*?\/(src|dist|node_modules)/g, '$1');
  });
}

function extractUserContext(req: Request): Record<string, any> | undefined {
  const user = (req as any).user;
  
  if (!user) {
    return undefined;
  }

  return {
    id: user.id || user.userId || user.sub,
    email: user.email,
    role: user.role || user.regra,
    // Don't log PII like full name, phone, etc.
  };
}

function getClientIp(req: Request): string {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function calculateRequestDuration(req: Request): number | undefined {
  const startTime = (req as any).startTime;
  
  if (!startTime) {
    return undefined;
  }

  return Date.now() - startTime;
}

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Error response middleware
 * Sends standardized error responses to clients
 * 
 * @see https://www.rfc-editor.org/rfc/rfc7807 (Problem Details for HTTP APIs)
 */
export const errorResponseMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // RFC 7807 compliant error response
  const errorResponse: any = {
    type: getErrorType(statusCode),
    title: getErrorTitle(statusCode),
    status: statusCode,
    detail: err.message,
    instance: req.originalUrl || req.url,
    timestamp: err.timestamp || new Date().toISOString(),
  };

  // Add correlation ID for tracking
  if (err.requestId) {
    errorResponse.requestId = err.requestId;
    res.setHeader('X-Request-ID', err.requestId);
  }

  // Add error code if available
  if (err.code) {
    errorResponse.code = err.code;
  }

  // Add additional details in development
  if (!isProduction) {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }

  // Add validation errors if present
  if (err.details?.errors) {
    errorResponse.errors = err.details.errors;
  }

  res.status(statusCode).json(errorResponse);
};

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
    default: return `${baseUrl}/error`;
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
    default: return 'Error';
  }
}

export const requestTimingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  (req as any).startTime = Date.now();
  next();
};

/**
 * Correlation ID middleware
 * Ensures every request has a correlation ID for tracking
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = 
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    generateCorrelationId();
  
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};

export class OperationalError extends Error implements AppError {
  public readonly isOperational = true;
  public readonly timestamp: string;
  
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends OperationalError {
  constructor(message: string = 'Bad Request', details?: Record<string, any>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends OperationalError {
  constructor(message: string = 'Unauthorized', details?: Record<string, any>) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends OperationalError {
  constructor(message: string = 'Forbidden', details?: Record<string, any>) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends OperationalError {
  constructor(message: string = 'Not Found', details?: Record<string, any>) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ConflictError extends OperationalError {
  constructor(message: string = 'Conflict', details?: Record<string, any>) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends OperationalError {
  constructor(message: string = 'Validation Error', details?: Record<string, any>) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class RateLimitError extends OperationalError {
  constructor(message: string = 'Too Many Requests', details?: Record<string, any>) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class ServiceUnavailableError extends OperationalError {
  constructor(message: string = 'Service Unavailable', details?: Record<string, any>) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}