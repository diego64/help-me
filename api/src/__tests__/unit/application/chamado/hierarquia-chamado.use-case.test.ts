import { describe, it, expect, vi, beforeEach } from 'vitest'

import { hierarquiaChamadoUseCase } from '@application/use-cases/chamado/hierarquia-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn().mockImplementation((node: any) => ({ ...node })),
}))

import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

const makeChamadoInicial = (overrides: any = {}) => ({
  chamadoPaiId: null,
  deletadoEm: null,
  ...overrides,
})

const makeChamadoFull = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Teste',
  status: 'ABERTO',
  prioridade: 'P4',
  chamadoPaiId: null,
  deletadoEm: null,
  usuario: null,
  tecnico: null,
  alteradorPrioridade: null,
  servicos: [],
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  encerradoEm: null,
  descricaoEncerramento: null,
  prioridadeAlterada: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.chamado.findMany).mockResolvedValue([])
})

describe('hierarquiaChamadoUseCase', () => {
  it('deve lançar NOT_FOUND quando chamado não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

    const error = await hierarquiaChamadoUseCase('chamado-id-123').catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
  })

  it('deve lançar NOT_FOUND quando chamado tem deletadoEm definido', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamadoInicial({ deletadoEm: new Date() }) as any
    )

    const error = await hierarquiaChamadoUseCase('chamado-id-123').catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve retornar ehRaiz=true quando o chamado não tem pai', async () => {
    vi.mocked(prisma.chamado.findUnique)
      .mockResolvedValueOnce(makeChamadoInicial() as any)          // busca inicial
      .mockResolvedValueOnce(makeChamadoFull() as any)             // buscarArvore findUnique

    const result = await hierarquiaChamadoUseCase('chamado-id-123')

    expect(result.ehRaiz).toBe(true)
  })

  it('deve retornar ehRaiz=false quando o chamado tem um pai', async () => {
    // chamado inicial tem pai
    vi.mocked(prisma.chamado.findUnique)
      .mockResolvedValueOnce(makeChamadoInicial({ chamadoPaiId: 'pai-id' }) as any) // busca inicial
      .mockResolvedValueOnce(makeChamadoInicial({ chamadoPaiId: null }) as any)     // cursor no pai
      .mockResolvedValueOnce(makeChamadoFull({ id: 'pai-id', OS: 'INC0000000' }) as any) // buscarArvore (pai)

    const result = await hierarquiaChamadoUseCase('chamado-id-123')

    expect(result.ehRaiz).toBe(false)
    expect(result.arvore).toBeDefined()
  })

  it('deve incluir filhos na árvore quando há filhos', async () => {
    vi.mocked(prisma.chamado.findUnique)
      .mockResolvedValueOnce(makeChamadoInicial() as any)
      .mockResolvedValueOnce(makeChamadoFull() as any)  // raiz
      .mockResolvedValueOnce(makeChamadoFull({ id: 'filho-id', OS: 'INC0000002', chamadoPaiId: 'chamado-id-123' }) as any)

    vi.mocked(prisma.chamado.findMany)
      .mockResolvedValueOnce([{ id: 'filho-id' }] as any) // filhos da raiz
      .mockResolvedValueOnce([])                           // filhos do filho

    const result = await hierarquiaChamadoUseCase('chamado-id-123')

    expect(result.arvore.filhos).toHaveLength(1)
  })

  it('deve logar info ao buscar hierarquia', async () => {
    vi.mocked(prisma.chamado.findUnique)
      .mockResolvedValueOnce(makeChamadoInicial() as any)
      .mockResolvedValueOnce(makeChamadoFull() as any)

    await hierarquiaChamadoUseCase('chamado-id-123')

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ chamadoId: 'chamado-id-123' }),
      '[CHAMADO] Hierarquia buscada'
    )
  })

  it('deve lançar ChamadoError HIERARQUIA_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('DB error'))

    const error = await hierarquiaChamadoUseCase('chamado-id-123').catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('HIERARQUIA_ERROR')
    expect(error.statusCode).toBe(500)
  })
})
