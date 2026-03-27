import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/config/logger';

/**
 * Nome do tracer — identifica o serviço no sistema de tracing distribuído
 * Aparece como "service.name" no Jaeger, Zipkin, Datadog APM
 */
const TRACER_NAME = 'auth-service';

/**
 * URLs que não precisam de spans de tracing
 * Evita poluição no sistema de tracing com health checks
 * Inspirado em: Datadog APM resource filtering, Jaeger sampling rules
 */
const SKIP_TRACING_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/favicon.ico',
]);

/**
 * Atributos HTTP padrão para spans
 * Seguindo convenções semânticas do OpenTelemetry
 * @see https://opentelemetry.io/docs/specs/semconv/http/http-spans/
 */
const HTTP_ATTRIBUTES = {
  METHOD: 'http.method',
  URL: 'http.url',
  TARGET: 'http.target',
  HOST: 'http.host',
  STATUS_CODE: 'http.status_code',
  USER_AGENT: 'http.user_agent',
  CLIENT_IP: 'http.client_ip',
  ROUTE: 'http.route',
  REQUEST_ID: 'http.request_id',
  CORRELATION_ID: 'http.correlation_id',
} as const;

/**
 * Extrai IP real do cliente considerando proxies
 * Inspirado em: Cloudflare CF-Connecting-IP, AWS ELB
 */
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Determina se a requisição deve ser rastreada
 * Bypassa health checks e endpoints de infraestrutura
 */
function shouldSkipTracing(req: Request): boolean {
  return SKIP_TRACING_PATHS.has(req.path);
}

/**
 * Middleware de distributed tracing com OpenTelemetry
 *
 * Funcionalidades:
 * - Cria span por requisição HTTP com atributos semânticos
 * - Propaga trace context entre microserviços via W3C TraceContext
 * - Enriquece req.log com traceId e spanId para correlação logs/traces
 * - Marca spans como erro automaticamente em respostas 5xx
 * - Registra duração, status code e rota em cada span
 * - Skip automático em health checks e métricas
 *
 * Compatível com: Jaeger, Zipkin, Datadog APM, AWS X-Ray, Google Cloud Trace
 * Inspirado em: Netflix distributed tracing, Uber Jaeger, Google Dapper
 *
 * @see https://opentelemetry.io/docs/instrumentation/js/
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Bypassa tracing para endpoints de infraestrutura
  if (shouldSkipTracing(req)) {
    return next();
  }

  const tracer = trace.getTracer(TRACER_NAME);
  const ip = getClientIp(req);

  /**
   * Criar Span
   * - Span representa esta requisição HTTP no sistema de tracing distribuído
   * - SpanKind.SERVER indica que este serviço está recebendo a requisição
   * - Inspirado em: OpenTelemetry HTTP semantic conventions
  */
  const spanName = `${req.method} ${req.path}`;

  const span = tracer.startSpan(spanName, {
    kind: SpanKind.SERVER,
    attributes: {
      // Atributos semânticos HTTP (OpenTelemetry conventions)
      [HTTP_ATTRIBUTES.METHOD]: req.method,
      [HTTP_ATTRIBUTES.URL]: req.url,
      [HTTP_ATTRIBUTES.TARGET]: req.path,
      [HTTP_ATTRIBUTES.HOST]: req.hostname,
      [HTTP_ATTRIBUTES.USER_AGENT]: req.get('user-agent') ?? 'unknown',
      [HTTP_ATTRIBUTES.CLIENT_IP]: ip,
      // IDs de rastreabilidade para correlação com logs
      [HTTP_ATTRIBUTES.REQUEST_ID]: req.id ?? 'unknown',
      [HTTP_ATTRIBUTES.CORRELATION_ID]:
        (req.headers['x-correlation-id'] as string) ?? 'unknown',
      // Identificação do serviço
      'service.name': TRACER_NAME,
      'service.version': process.env.APP_VERSION ?? '1.0.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    },
  });

  /**
   * Contexto Ativo
   * - Torna este span o span ativo no contexto atual
   * - Permite que instrumentações automáticas (Prisma, Redis, HTTP) criem child spans
  */
  const ctx = trace.setSpan(context.active(), span);

  /**
   * Enriquece req.log
   * - Correlaciona logs com traces usando traceId e spanId
   * - No Datadog/Grafana, isso permite navegar de um log para o trace correspondente
   * - Inspirado em: Datadog log-trace correlation, AWS X-Ray log enrichment
   */
  const spanContext = span.spanContext();
  if (req.log && spanContext) {
    req.log = req.log.child({
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      // Flags do trace context W3C (ex: sampled=1)
      traceFlags: spanContext.traceFlags,
    });
  }

  /**
   * Propaga Trace Context para Respostas
   * - Retorna traceId no header para que o cliente possa correlacionar
   * - Útil para debugging em produção: o cliente reporta o traceId e o time encontra o trace
   * - Inspirado em: Stripe, GitHub trace headers
   */
  res.setHeader('X-Trace-ID', spanContext.traceId);

  /**
   * Finaliza Span na Resposta
   * - Captura status code e marca erro em respostas 5xx
   * - Inspirado em: OpenTelemetry HTTP instrumentation
   */
  res.on('finish', () => {
    const statusCode = res.statusCode;

    // Adiciona status code como atributo do span
    span.setAttribute(HTTP_ATTRIBUTES.STATUS_CODE, statusCode);

    // Adiciona rota parametrizada se disponível (ex: /usuarios/:id)
    // Mais útil para agrupamento no Jaeger do que a URL com parâmetros reais
    if (req.route?.path) {
      span.setAttribute(HTTP_ATTRIBUTES.ROUTE, req.route.path as string);
    }

    // Marca span como erro em respostas 5xx
    // Inspirado em: OpenTelemetry error semantic conventions
    if (statusCode >= 500) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${statusCode}`,
      });

      logger.debug(
        { traceId: spanContext.traceId, spanId: spanContext.spanId, statusCode },
        '[TRACING] Span marcado como erro'
      );
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // Finaliza o span — registra duração e envia ao coletor
    span.end();
  });

  /**
   * Executa no Contexto do Span
   * - context.with garante que instrumentações automáticas dentro desta
   *   requisição (ex: queries Prisma, chamadas Redis) criem child spans
   *   corretamente vinculados a este span pai
   */
  context.with(ctx, () => {
    next();
  });
}

/**
 * Inicializa o OpenTelemetry SDK com instrumentações automáticas
 *
 * Deve ser chamado ANTES de qualquer import da aplicação
 * pois as instrumentações automáticas fazem monkey-patching
 *
 * Instrumentações automáticas incluídas:
 * - HTTP/HTTPS requests
 * - Express routes
 * - Prisma queries (via @prisma/instrumentation)
 * - Redis commands
 *
 * Inspirado em: Netflix telemetry bootstrap, Uber Jaeger client setup
 *
 * @example
 * // No server.ts — DEVE ser o primeiro import
 * import { initTracing } from './middlewares/tracing.middleware';
 * initTracing();
 *
 * import express from 'express'; // imports da app DEPOIS
 */
export async function initTracing(): Promise<void> {
  // Só inicializa se o endpoint do coletor estiver configurado
  // Permite rodar sem tracing em ambientes sem infraestrutura OTEL
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info('[TRACING] OTEL_EXPORTER_OTLP_ENDPOINT não configurado — tracing desabilitado');
    return;
  }

  try {
    // Importação dinâmica para evitar overhead em ambientes sem tracing
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    const sdk = new NodeSDK({
      // Exporta traces para o coletor OTEL (Jaeger, Tempo, Datadog Agent)
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),

      // Instrumentações automáticas — zero config para Express, HTTP, etc
      instrumentations: [
        getNodeAutoInstrumentations({
          // Desabilita instrumentação de fs — muito verboso, pouco útil
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();

    // Garante que os spans pendentes são enviados antes do processo encerrar
    process.on('SIGTERM', async () => {
      await sdk.shutdown();
      logger.info('[TRACING] OpenTelemetry SDK encerrado com sucesso');
    });

    logger.info(
      { endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT },
      '[TRACING] OpenTelemetry SDK inicializado'
    );
  } catch (err) {
    logger.error({ err }, '[TRACING] Falha ao inicializar OpenTelemetry SDK');
  }
}