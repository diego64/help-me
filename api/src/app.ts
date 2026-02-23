import express, { Request, Response, NextFunction, Express } from 'express';
import session from 'express-session';
import compression from 'compression';
import { RedisStore } from 'connect-redis';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './shared/config/swagger';
import { redisClient } from './infrastructure/database/redis/client';
import { errorLoggerMiddleware } from './infrastructure/http/middlewares/error-logger.middleware';
import { requestLoggerMiddleware } from './infrastructure/http/middlewares/request-logger.middleware';
import routes from './presentation/http/routes';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido nas variáveis de ambiente!');
}

export const app: Express = express();

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLoggerMiddleware);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Help-Me API',
    version: '1.1.1',
    docs: '/api-docs',
    health: '/health'
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'helpme-api',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      defaultModelsExpandDepth: -1, // segurança extra no UI
    },
  }),
);

app.use('/api', routes);

app.use((req: Request, res: Response) => {
  req.log.warn({ path: req.path, method: req.method }, 'Route not found');
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method,
    requestId: req.id,
  });
});

app.use(errorLoggerMiddleware);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Erro interno do servidor',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    requestId: req.id,
  });
});

export default app;