import { describe, it, expect, vi } from 'vitest'
import { errorMiddleware } from '@infrastructure/http/middlewares/error.middleware'
import { DomainError } from '@/domain/shared/domain.error'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@shared/config/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as any
  res.status.mockReturnValue(res)
  return res
}

const makeReq = (path = '/test') => ({ path } as any)
const next = vi.fn()

describe('errorMiddleware', () => {
  it('retorna 404 para DomainError com mensagem "não encontrado"', () => {
    const res = makeRes()
    errorMiddleware(new DomainError('Item não encontrado'), makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Não Encontrado', status: 404 })
    )
  })

  it('retorna 404 para DomainError com mensagem "não encontrada"', () => {
    const res = makeRes()
    errorMiddleware(new DomainError('Categoria não encontrada'), makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('retorna 422 para DomainError genérico', () => {
    const res = makeRes()
    errorMiddleware(new DomainError('Estoque insuficiente'), makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Entidade Não Processável', status: 422 })
    )
  })

  it('retorna 500 para RepositoryError', () => {
    const res = makeRes()
    errorMiddleware(new RepositoryError('DB error', 'DB_ERR'), makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 })
    )
  })

  it('retorna 500 para erro genérico', () => {
    const res = makeRes()
    errorMiddleware(new Error('unexpected'), makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('inclui instance com o path da requisição', () => {
    const res = makeRes()
    errorMiddleware(new DomainError('erro'), makeReq('/api/items'), res, next)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ instance: '/api/items' })
    )
  })
})
