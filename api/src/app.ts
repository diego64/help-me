import express, { Request, Response, NextFunction, Express } from 'express';
import session from 'express-session';
import compression from 'compression';
import { RedisStore } from 'connect-redis';
import { redisClient } from './services/redisClient';

import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import tecnicoRoutes from './routes/tecnico.routes';
import usuarioRoutes from './routes/usuario.routes';
import servicoRoutes from './routes/servico.routes';
import chamadoRoutes from './routes/chamado.routes';
import filaDeChamadosRoutes from './routes/fila-de-chamados.routes';
import envioDeEmailTeste from './routes/envio-email-teste.routes';

import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { errorLoggerMiddleware } from './middleware/error-logger.middleware';

import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido nas variáveis de ambiente!');
}

export const app: Express = express();

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
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
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
    sameSite: 'lax'
  }
}));

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'helpme-api',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/tecnico', tecnicoRoutes);
app.use('/usuario', usuarioRoutes);
app.use('/servico', servicoRoutes);
app.use('/chamado', chamadoRoutes);
app.use('/filadechamados', filaDeChamadosRoutes);
app.use('/testeemail', envioDeEmailTeste);

app.use((req: Request, res: Response) => {
  req.log.warn({ 
    path: req.path, 
    method: req.method 
  }, 'Route not found');
  
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