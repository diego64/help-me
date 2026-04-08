import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { logger } from '@shared/config/logger';
import { errorMiddleware } from '@infrastructure/http/middlewares/error.middleware';
import routes from '@presentation/http/routes/index';

export function createApp(): Application {
  const app: Application = express();

  app.use(helmet());

  app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-Correlation-ID'],
  }));

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em instantes.' },
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (process.env.NODE_ENV !== 'production') {
    const swaggerJsdoc = require('swagger-jsdoc');
    const swaggerUi = require('swagger-ui-express');

    const spec = swaggerJsdoc({
      definition: {
        openapi: '3.0.0',
        info: { title: 'Inventory Service API', version: '1.0.0' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      apis: ['./src/presentation/http/routes/*.ts'],
    });

    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Inventory Service API' }));
    logger.info('[APP] Swagger disponível em /docs');
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
    });
  });

  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/v1', routes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      type: 'about:blank',
      title: 'Não Encontrado',
      status: 404,
      detail: 'Rota não encontrada.',
    });
  });

  app.use(errorMiddleware);

  return app;
}
