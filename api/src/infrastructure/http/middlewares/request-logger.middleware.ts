import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '@shared/config/logger';

/**
 * 
 * @example
 * // In your Express app:
 * app.use(requestLoggerMiddleware);
 * 
 * // In your route handlers:
 * app.get('/users/:id', (req, res) => {
 *   req.log.info('Fetching user'); // Uses contextual logger
 *   res.json({ user });
 * });
 */
export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {

  const requestId = randomUUID();
  req.id = requestId;
  req.log = logger.child({
    requestId,
    ...(req.user?.id && { userId: req.user.id }),
  });

  const startTime = Date.now();
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

  const originalJson = res.json.bind(res);

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