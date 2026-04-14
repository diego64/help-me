import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, NivelTecnico } from '@prisma/client'

import { vincularChamadoUseCase } from '@application/use-cases/chamado/vincular-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn().mockImplementation((c: any) => ({ ...c })),
}))

import { prisma } from '@infrastructure/database/prisma/client'
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'

const makeInput = (overrides: any = {}) => ({
  paiId: 'pai-id',
  filhoId: 'filho-id',
  usuarioId: 'admin-id',
  usuarioNome: 'Admin',
  usuarioEmail: 'admin@email.com',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (id: string, overrides: any = {}) => ({
  id,
  OS: `INC000000${id.includes('pai') ? '1' : '2'}`,
  chamadoPaiId: null,
  deletadoEm: null,
  status: ChamadoStatus.ABERTO,
  ...overrides,
})

const makeChamadoAtualizado = () => ({
  id: 'filho-id',
  OS: 'INC0000002',
  status: ChamadoStatus.ENCERRADO,
  usuario: null,
  tecnico: null,
  alteradorPrioridade: null,
  servicos: [],
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N2 } as any)
  vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
    if (where.id === 'pai-id')   return makeChamado('pai-id') as any
    if (where.id === 'filho-id') return makeChamado('filho-id') as any
    return null
  })
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({ chamado: { update: vi.fn().mockResolvedValue(makeChamadoAtualizado()) } })
  )
})

describe('vincularChamadoUseCase', () => {
  it('deve lançar FORBIDDEN quando TECNICO N1 tenta vincular', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

    const error = await vincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('deve lançar SELF_LINK quando paiId === filhoId', async () => {
    const error = await vincularChamadoUseCase(makeInput({ paiId: 'mesmo-id', filhoId: 'mesmo-id' })).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('SELF_LINK')
  })

  it('deve lançar NOT_FOUND quando pai não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.id === 'filho-id') return makeChamado('filho-id') as any
      return null
    })

    const error = await vincularChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toContain('pai')
  })

  it('deve lançar NOT_FOUND quando filho não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.id === 'pai-id') return makeChamado('pai-id') as any
      return null
    })

    const error = await vincularChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toContain('filho')
  })

  it('deve lançar CYCLE quando criaria um ciclo', async () => {
    // pai tem chamadoPaiId = filhoId (criaria ciclo)
    vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.id === 'pai-id')   return makeChamado('pai-id', { chamadoPaiId: 'filho-id' }) as any
      if (where.id === 'filho-id') return makeChamado('filho-id') as any
      return null
    })

    const error = await vincularChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('CYCLE')
  })

  it('deve lançar ALREADY_LINKED quando filho já é filho do pai', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N2 } as any)
    vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.id === 'pai-id')   return makeChamado('pai-id') as any
      if (where.id === 'filho-id') return makeChamado('filho-id', { chamadoPaiId: 'pai-id' }) as any
      return null
    })

    const error = await vincularChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('ALREADY_LINKED')
  })

  it('deve vincular com sucesso e chamar salvarHistoricoChamado', async () => {
    const result = await vincularChamadoUseCase(makeInput())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(salvarHistoricoChamado).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: 'filho-id',
        tipo: 'STATUS',
        para: ChamadoStatus.ENCERRADO,
      })
    )
    expect(result.message).toContain('vinculado')
  })

  it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
    vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

    await expect(vincularChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve lançar ChamadoError LINK_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.chamado.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.id === 'pai-id')   return makeChamado('pai-id') as any
      if (where.id === 'filho-id') return makeChamado('filho-id') as any
      return null
    })
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB error'))

    const error = await vincularChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('LINK_ERROR')
  })
})
