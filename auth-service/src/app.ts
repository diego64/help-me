import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { swaggerSpec } from '@shared/config/swagger';
import { logger } from '@shared/config/logger';
import { validateSecrets } from '@shared/config/jwt';
import {
  requestTimingMiddleware,
  correlationIdMiddleware,
  errorLoggerMiddleware,
  errorResponseMiddleware,
} from '@infrastructure/http/middlewares/error.middleware';
import { requestLoggerMiddleware } from '@infrastructure/http/middlewares/request-logger.middleware';
import { tracingMiddleware } from '@infrastructure/http/middlewares/tracing.middleware';
import { apiLimiter } from '@infrastructure/http/middlewares/rate-limit.middleware';
import routes from '@presentation/http/routes/index.routes';

validateSecrets();

const app: Application = express();

app.use(requestTimingMiddleware); // Timing deve ser o primeiro para medir duração real da requisição
app.use(correlationIdMiddleware); // Correlation ID garante rastreabilidade desde o início
app.use(tracingMiddleware); // Tracing distribuído
app.use(requestLoggerMiddleware); // Logger de requisições

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],   // necessário para Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"],  // necessário para Swagger UI
      imgSrc: ["'self'", 'data:'],
    },
  },
  crossOriginEmbedderPolicy: false, // necessário para Swagger UI
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID'],
}));

// Rate limit geral — proteção básica para todos os endpoints
app.use(apiLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Auth Service API',
  }));
  logger.info('[APP] Swagger disponível em /docs');
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Rota não encontrada.',
    status: 404,
  });
});

app.use(errorLoggerMiddleware);
app.use(errorResponseMiddleware);

export default app;