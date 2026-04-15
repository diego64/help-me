import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { randomUUID } from 'node:crypto';
import { logger } from '@shared/config/logger';

export interface HttpClientConfig {
  baseURL: string;
  timeoutMs?: number;
  serviceName: string;
}

export interface HttpError extends Error {
  status: number;
  code: string;
  service: string;
  requestId: string;
}

function createHttpError(
  message: string,
  status: number,
  code: string,
  service: string,
  requestId: string,
): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.code = code;
  error.service = service;
  error.requestId = requestId;
  return error;
}

export function createHttpClient(config: HttpClientConfig): AxiosInstance {
  const { baseURL, timeoutMs = 10_000, serviceName } = config;

  const instance = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Interceptor de request: injeta requestId e loga a saída
  instance.interceptors.request.use((req: InternalAxiosRequestConfig) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = requestId;
    (req as InternalAxiosRequestConfig & { _requestId: string })._requestId = requestId;
    (req as InternalAxiosRequestConfig & { _startedAt: number })._startedAt = Date.now();

    logger.debug(
      { service: serviceName, requestId, method: req.method?.toUpperCase(), url: req.url },
      'http-client request',
    );

    return req;
  });

  // Interceptor de response: loga resultado e duração
  instance.interceptors.response.use(
    (res: AxiosResponse) => {
      const req = res.config as InternalAxiosRequestConfig & {
        _requestId?: string;
        _startedAt?: number;
      };
      const durationMs = req._startedAt ? Date.now() - req._startedAt : undefined;

      logger.debug(
        {
          service: serviceName,
          requestId: req._requestId,
          status: res.status,
          durationMs,
          url: req.url,
        },
        'http-client response',
      );

      return res;
    },
    (error: unknown) => {
      if (!isAxiosError(error)) {
        return Promise.reject(error);
      }

      const req = error.config as
        | (InternalAxiosRequestConfig & { _requestId?: string; _startedAt?: number })
        | undefined;

      const requestId = req?._requestId ?? 'unknown';
      const status = error.response?.status ?? 503;
      const serverMessage = (error.response?.data as { detail?: string } | undefined)?.detail;
      const message = serverMessage ?? error.message;

      logger.warn(
        {
          service: serviceName,
          requestId,
          status,
          url: req?.url,
          message,
        },
        'http-client error',
      );

      return Promise.reject(
        createHttpError(message, status, error.code ?? 'HTTP_ERROR', serviceName, requestId),
      );
    },
  );

  return instance;
}

// Instância pré-configurada para o auth-service
export const authServiceClient = createHttpClient({
  baseURL: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333',
  timeoutMs: 5_000,
  serviceName: 'auth-service',
});
