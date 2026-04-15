import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { encerrarFilhosRecursivo } from '@application/use-cases/chamado/helpers/filhos.helper'

const makeTx = (filhos: any[] = []) => ({
  chamado: {
    findMany:   vi.fn().mockResolvedValue(filhos),
    updateMany: vi.fn().mockResolvedValue({ count: filhos.length }),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('encerrarFilhosRecursivo', () => {
  it('não deve chamar updateMany quando não há filhos', async () => {
    const tx = makeTx([])

    await encerrarFilhosRecursivo('pai-id', 'INC0000001', tx)

    expect(tx.chamado.findMany).toHaveBeenCalledTimes(1)
    expect(tx.chamado.updateMany).not.toHaveBeenCalled()
  })

  it('deve buscar filhos excluindo ENCERRADO e CANCELADO do where', async () => {
    const tx = makeTx([])

    await encerrarFilhosRecursivo('pai-id', 'INC0000001', tx)

    expect(tx.chamado.findMany).toHaveBeenCalledWith({
      where: {
        chamadoPaiId: 'pai-id',
        deletadoEm: null,
        status: { notIn: [ChamadoStatus.ENCERRADO, ChamadoStatus.CANCELADO] },
      },
      select: { id: true, OS: true },
    })
  })

  it('deve chamar updateMany quando há filhos', async () => {
    const filho1 = { id: 'filho-1', OS: 'INC0000002' }
    const filho2 = { id: 'filho-2', OS: 'INC0000003' }

    // primeira chamada: retorna filhos; chamadas subsequentes (recursão): retorna []
    let callCount = 0
    const tx = {
      chamado: {
        findMany: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.resolve([filho1, filho2])
          return Promise.resolve([])
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }

    await encerrarFilhosRecursivo('pai-id', 'INC0000001', tx)

    expect(tx.chamado.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['filho-1', 'filho-2'] } },
      data: expect.objectContaining({
        status: ChamadoStatus.ENCERRADO,
        descricaoEncerramento: 'Chamado encerrado automaticamente — chamado pai INC0000001 foi encerrado',
      }),
    })
  })

  it('deve chamar recursão para cada filho encontrado', async () => {
    const filho1 = { id: 'filho-1', OS: 'INC0000002' }
    const filho2 = { id: 'filho-2', OS: 'INC0000003' }

    let callCount = 0
    const tx = {
      chamado: {
        findMany: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.resolve([filho1, filho2])
          return Promise.resolve([])
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }

    await encerrarFilhosRecursivo('pai-id', 'INC0000001', tx)

    // 1 chamada pai + 2 chamadas recursivas
    expect(tx.chamado.findMany).toHaveBeenCalledTimes(3)
  })

  it('deve definir encerradoEm e atualizadoEm ao atualizar filhos', async () => {
    const filho = { id: 'filho-1', OS: 'INC0000002' }

    let callCount = 0
    const tx = {
      chamado: {
        findMany: vi.fn().mockImplementation(() => {
          callCount++
          return callCount === 1 ? Promise.resolve([filho]) : Promise.resolve([])
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const antes = new Date()
    await encerrarFilhosRecursivo('pai-id', 'INC0000001', tx)
    const depois = new Date()

    const [updateArgs] = tx.chamado.updateMany.mock.calls[0] as any[]
    expect(updateArgs.data.encerradoEm.getTime()).toBeGreaterThanOrEqual(antes.getTime())
    expect(updateArgs.data.encerradoEm.getTime()).toBeLessThanOrEqual(depois.getTime())
  })
})
