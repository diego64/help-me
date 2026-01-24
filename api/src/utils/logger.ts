import pino from 'pino';
import fs from 'fs';
import path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Criar diretório de logs se não existir
const logDir = isDevelopment 
  ? path.join(process.cwd(), 'logs')  // ./logs na pasta do projeto
  : '/var/log/helpme-api';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

// Streams para desenvolvimento e produção
const streams: pino.StreamEntry[] = [
  // Stream para arquivo (sempre em JSON)
  {
    level: 'info',
    stream: pino.destination({
      dest: logFile,
      sync: false,
    }),
  },
];

if (isDevelopment) {
  streams.push({
    level: 'info',
    stream: pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    }),
  });
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    
    formatters: {
      level: (label) => {
        return { level: label };
      },
      bindings: (bindings) => {
        return {
          pid: bindings.pid,
          hostname: bindings.hostname,
          service: 'helpme-api',
          environment: process.env.NODE_ENV || 'development',
        };
      },
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query,
        params: req.params,
        remoteAddress: req.remoteAddress || req.ip,
        remotePort: req.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  pino.multistream(streams)
);

export const testLogger = pino({
  level: 'silent',
});

export default logger;