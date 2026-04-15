import { describe, it, expect, vi, beforeEach } from 'vitest'

import { historicoUseCase } from '@application/use-cases/chamado/historico-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  listarHistoricoChamado: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { listarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'
import { logger } from '@shared/config/logger'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('historicoUseCase', () => {
  it('deve retornar array de histórico em caso de sucesso', async () => {
    const historico = [
      { id: 'h1', tipo: 'ABERTURA', dataHora: new Date() },
      { id: 'h2', tipo: 'STATUS',   dataHora: new Date() },
    ]
    vi.mocked(listarHistoricoChamado).mockResolvedValue(historico as any)

    const result = await historicoUseCase('chamado-id-123')

    expect(result).toEqual(historico)
    expect(listarHistoricoChamado).toHaveBeenCalledWith('chamado-id-123')
  })

  it('deve logar info com chamadoId e total', async () => {
    vi.mocked(listarHistoricoChamado).mockResolvedValue([{ id: 'h1' }] as any)

    await historicoUseCase('chamado-id-123')

    expect(logger.info).toHaveBeenCalledWith(
      { chamadoId: 'chamado-id-123', total: 1 },
      '[CHAMADO] Histórico buscado'
    )
  })

  it('deve relançar ChamadoError sem encapsular', async () => {
    const chamadoError = new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404)
    vi.mocked(listarHistoricoChamado).mockRejectedValue(chamadoError)

    const error = await historicoUseCase('chamado-id-123').catch(e => e)

    expect(error).toBe(chamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar ChamadoError com code HISTORICO_ERROR em erro inesperado', async () => {
    vi.mocked(listarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

    const error = await historicoUseCase('chamado-id-123').catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('HISTORICO_ERROR')
    expect(error.statusCode).toBe(500)
  })

  it('deve incluir originalError quando erro inesperado', async () => {
    const originalError = new Error('Mongo error')
    vi.mocked(listarHistoricoChamado).mockRejectedValue(originalError)

    const error = await historicoUseCase('chamado-id-123').catch(e => e)

    expect(error.originalError).toBe(originalError)
  })

  it('deve logar erro quando lançar ChamadoError HISTORICO_ERROR', async () => {
    const err = new Error('Mongo error')
    vi.mocked(listarHistoricoChamado).mockRejectedValue(err)

    await historicoUseCase('chamado-id-123').catch(() => {})

    expect(logger.error).toHaveBeenCalledWith(
      { error: err, chamadoId: 'chamado-id-123' },
      '[CHAMADO] Erro ao buscar histórico'
    )
  })
})
