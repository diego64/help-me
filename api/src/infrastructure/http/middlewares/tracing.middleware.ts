import { trace, context } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';

export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  if (spanContext) {
    req.log = req.log.child({
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    });
  }

  next();
}