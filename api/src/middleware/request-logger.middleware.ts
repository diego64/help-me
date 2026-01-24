import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger';

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Gerar ID único para o request
  const requestId = randomUUID();
  req.id = requestId;

  // Criar logger contextual para este request
  req.log = logger.child({
    requestId,
    ...(req.user?.id && { userId: req.user.id }),
  });

  // Timestamp de início
  const startTime = Date.now();

  // Log do request
  req.log.info(
    {
      method: req.method,
      url: req.url,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      ...(Object.keys(req.query).length > 0 && { query: req.query }),
      ...(Object.keys(req.params).length > 0 && { params: req.params }),
    },
    'Incoming request'
  );

  // Capturar o método original res.json
  const originalJson = res.json.bind(res);

  // Sobrescrever res.json
  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    req.log.info(
      {
        statusCode: res.statusCode,
        duration,
      },
      'Request completed'
    );

    return originalJson(body);
  };

  // Listener para erros
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      const duration = Date.now() - startTime;
      req.log.warn(
        {
          statusCode: res.statusCode,
          duration,
        },
        'Request finished with error status'
      );
    }
  });

  next();
};