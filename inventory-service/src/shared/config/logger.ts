import pino from 'pino';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const isDevelopment = process.env.NODE_ENV !== 'production';
const logFile = process.env.LOG_FILE;
const logLevel = process.env.LOG_LEVEL || 'info';

const pinoOptions: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      service: 'inventory-service',
      environment: process.env.NODE_ENV || 'development',
    }),
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
};

/**
 * Cria o destino de escrita dos logs usando pino.multistream (síncrono).
 *
 * Evitamos pino.transport({ targets }) porque ele cria worker threads que,
 * no contexto do tsx watch (--import loader ESM), herdam o loader do tsx e
 * travam silenciosamente — o arquivo fica aberto mas nunca recebe bytes.
 *
 * pino.multistream é síncrono e não usa worker threads, resolvendo o problema.
 */
function buildDestination(): pino.MultiStreamRes | NodeJS.WritableStream {
  const streams: pino.StreamEntry[] = [];

  if (isDevelopment) {
    // pino-pretty como stream síncrono (devDependency)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pretty = require('pino-pretty') as (opts: object) => NodeJS.WritableStream;
    streams.push({
      stream: pretty({ colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname', singleLine: false }),
      level: 'debug' as pino.Level,
    });
  } else {
    streams.push({ stream: process.stdout, level: logLevel as pino.Level });
  }

  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    streams.push({
      stream: createWriteStream(logFile, { flags: 'a' }),
      level: logLevel as pino.Level,
    });
  }

  return streams.length === 1 ? (streams[0]!.stream as unknown as NodeJS.WritableStream) : pino.multistream(streams);
}

export const logger = pino(pinoOptions, buildDestination());
export const testLogger = pino({ level: 'silent' });
export default logger;