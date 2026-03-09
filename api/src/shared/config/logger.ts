import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { sendToLoki } from './loki-sender';

const isDevelopment = process.env.NODE_ENV !== 'production';

const transport = isDevelopment
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    })
  : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',

    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: 'helpme-api',
        environment: process.env.NODE_ENV || 'development',
      }),
      log: (object) => {
        const span = trace.getActiveSpan();
        const enriched = span ? {
          ...object,
          ...span.spanContext(),
        } : object;

        // Enviar para Loki no mesmo processo
        sendToLoki(enriched as Record<string, unknown>);

        return enriched;
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
      res: (res) => ({ statusCode: res.statusCode }),
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  transport
);

export const testLogger = pino({ level: 'silent' });

export default logger;