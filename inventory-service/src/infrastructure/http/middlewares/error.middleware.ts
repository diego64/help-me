import { Request, Response, NextFunction } from 'express';
import { DomainError } from '@/domain/shared/domain.error';
import { RepositoryError } from '@infrastructure/repositories/repository.error';
import { logger } from '@shared/config/logger';

function problemDetail(
  res: Response,
  status: number,
  title: string,
  detail: string,
  instance: string,
): void {
  res.status(status).json({
    type: 'about:blank',
    title,
    status,
    detail,
    instance,
  });
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DomainError) {
    const ehNaoEncontrado = /não encontrad[ao]/i.test(err.message);
    if (ehNaoEncontrado) {
      problemDetail(res, 404, 'Não Encontrado', err.message, req.path);
      return;
    }
    problemDetail(res, 422, 'Entidade Não Processável', err.message, req.path);
    return;
  }

  if (err instanceof RepositoryError) {
    logger.error({ err, code: err.code }, 'Erro de repositório');
    problemDetail(res, 500, 'Erro Interno', 'Erro ao acessar dados. Tente novamente.', req.path);
    return;
  }

  logger.error({ err }, 'Erro inesperado');
  problemDetail(res, 500, 'Erro Interno', 'Erro interno do servidor.', req.path);
}
