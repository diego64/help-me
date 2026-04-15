import { describe, it, expect } from 'vitest'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

describe('RepositoryError', () => {
  it('cria erro com message e code', () => {
    const err = new RepositoryError('mensagem', 'CODIGO')

    expect(err.message).toBe('mensagem')
    expect(err.code).toBe('CODIGO')
    expect(err.name).toBe('RepositoryError')
    expect(err.originalError).toBeUndefined()
  })

  it('cria erro com originalError', () => {
    const original = new Error('original')
    const err = new RepositoryError('mensagem', 'CODIGO', original)

    expect(err.originalError).toBe(original)
  })

  it('é instância de Error', () => {
    const err = new RepositoryError('mensagem', 'CODIGO')
    expect(err).toBeInstanceOf(Error)
  })
})
