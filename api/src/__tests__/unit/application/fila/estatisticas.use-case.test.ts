import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { estatisticasUseCase } from '@application/use-cases/fila/estatisticas.use-case'
import { FilaError } from '@application/use-cases/fila/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const makeGroupByResult = (overrides: Array<{ prioridade: PrioridadeChamado; count: number }> = []) => {
  const defaults = [
    { prioridade: 'P1' as PrioridadeChamado, _count: { id: 2 } },
    { prioridade: 'P2' as PrioridadeChamado, _count: { id: 3 } },
    { prioridade: 'P3' as PrioridadeChamado, _count: { id: 5 } },
    { prioridade: 'P4' as PrioridadeChamado, _count: { id: 10 } },
    { prioridade: 'P5' as PrioridadeChamado, _count: { id: 15 } },
  ]

  if (overrides.length === 0) return defaults

  return overrides.map(({ prioridade, count }) => ({
    prioridade,
    _count: { id: count },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()

  // Setup padrão: retorna valores simulados para todas as queries
  vi.mocked(prisma.chamado.count)
    .mockResolvedValueOnce(35) // totalChamados
    .mockResolvedValueOnce(5)  // abertos
    .mockResolvedValueOnce(10) // emAtendimento
    .mockResolvedValueOnce(15) // encerrados
    .mockResolvedValueOnce(3)  // cancelados
    .mockResolvedValueOnce(2)  // reabertos
    .mockResolvedValueOnce(5)  // semTecnico

  vi.mocked(prisma.chamado.groupBy).mockResolvedValue(makeGroupByResult() as any)
})

describe('estatisticasUseCase', () => {
  describe('execução das queries em paralelo', () => {
    it('deve chamar count 7 vezes em paralelo', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenCalledTimes(7)
    })

    it('deve chamar groupBy 1 vez', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.groupBy).toHaveBeenCalledTimes(1)
    })

    it('deve executar todas as queries com Promise.all', async () => {
      const countSpy = vi.mocked(prisma.chamado.count)
      const groupBySpy = vi.mocked(prisma.chamado.groupBy)

      let allResolved = false

      countSpy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 1
      })

      groupBySpy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        allResolved = true
        return makeGroupByResult() as any
      })

      await estatisticasUseCase()

      expect(allResolved).toBe(true)
    })
  })

  describe('filtros das queries', () => {
    it('deve filtrar totalChamados por deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(1, {
        where: { deletadoEm: null },
      })
    })

    it('deve filtrar abertos por status ABERTO e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(2, {
        where: { status: ChamadoStatus.ABERTO, deletadoEm: null },
      })
    })

    it('deve filtrar emAtendimento por status EM_ATENDIMENTO e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(3, {
        where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null },
      })
    })

    it('deve filtrar encerrados por status ENCERRADO e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(4, {
        where: { status: ChamadoStatus.ENCERRADO, deletadoEm: null },
      })
    })

    it('deve filtrar cancelados por status CANCELADO e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(5, {
        where: { status: ChamadoStatus.CANCELADO, deletadoEm: null },
      })
    })

    it('deve filtrar reabertos por status REABERTO e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(6, {
        where: { status: ChamadoStatus.REABERTO, deletadoEm: null },
      })
    })

    it('deve filtrar semTecnico por tecnicoId null e deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.count).toHaveBeenNthCalledWith(7, {
        where: { tecnicoId: null, deletadoEm: null },
      })
    })

    it('deve chamar groupBy com deletadoEm null', async () => {
      await estatisticasUseCase()

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith({
        by: ['prioridade'],
        where: { deletadoEm: null },
        _count: { id: true },
      })
    })
  })

  describe('retorno das estatísticas', () => {
    it('deve retornar total de chamados', async () => {
      const result = await estatisticasUseCase()

      expect(result.total).toBe(35)
    })

    it('deve retornar porStatus com todos os status', async () => {
      const result = await estatisticasUseCase()

      expect(result.porStatus).toEqual({
        abertos: 5,
        emAtendimento: 10,
        encerrados: 15,
        cancelados: 3,
        reabertos: 2,
      })
    })

    it('deve retornar porPrioridade com todas as prioridades', async () => {
      const result = await estatisticasUseCase()

      expect(result.porPrioridade).toEqual({
        P1: 2,
        P2: 3,
        P3: 5,
        P4: 10,
        P5: 15,
      })
    })

    it('deve calcular filaAlta corretamente (P1 + P2 + P3)', async () => {
      const result = await estatisticasUseCase()

      expect(result.filaAlta).toBe(10) // 2 + 3 + 5
    })

    it('deve calcular filaBaixa corretamente (P4 + P5)', async () => {
      const result = await estatisticasUseCase()

      expect(result.filaBaixa).toBe(25) // 10 + 15
    })

    it('deve calcular pendentes corretamente (abertos + reabertos)', async () => {
      const result = await estatisticasUseCase()

      expect(result.pendentes).toBe(7) // 5 + 2
    })

    it('deve retornar semTecnico', async () => {
      const result = await estatisticasUseCase()

      expect(result.semTecnico).toBe(5)
    })

    it('deve retornar timestamp em formato ISO', async () => {
      const result = await estatisticasUseCase()

      expect(result.timestamp).toBeDefined()
      expect(() => new Date(result.timestamp)).not.toThrow()
    })

    it('deve retornar todos os campos obrigatórios', async () => {
      const result = await estatisticasUseCase()

      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('porStatus')
      expect(result).toHaveProperty('porPrioridade')
      expect(result).toHaveProperty('filaAlta')
      expect(result).toHaveProperty('filaBaixa')
      expect(result).toHaveProperty('pendentes')
      expect(result).toHaveProperty('semTecnico')
      expect(result).toHaveProperty('timestamp')
    })
  })

  describe('cenários com prioridades faltantes', () => {
    it('deve retornar 0 para prioridade ausente no groupBy', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue(
        makeGroupByResult([
          { prioridade: 'P1' as PrioridadeChamado, count: 5 },
          { prioridade: 'P3' as PrioridadeChamado, count: 10 },
        ]) as any
      )

      const result = await estatisticasUseCase()

      expect(result.porPrioridade.P2).toBe(0)
      expect(result.porPrioridade.P4).toBe(0)
      expect(result.porPrioridade.P5).toBe(0)
    })

    it('deve calcular filaAlta=0 quando não há P1, P2, P3', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue(
        makeGroupByResult([
          { prioridade: 'P4' as PrioridadeChamado, count: 10 },
          { prioridade: 'P5' as PrioridadeChamado, count: 15 },
        ]) as any
      )

      const result = await estatisticasUseCase()

      expect(result.filaAlta).toBe(0)
    })

    it('deve calcular filaBaixa=0 quando não há P4, P5', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue(
        makeGroupByResult([
          { prioridade: 'P1' as PrioridadeChamado, count: 2 },
          { prioridade: 'P2' as PrioridadeChamado, count: 3 },
        ]) as any
      )

      const result = await estatisticasUseCase()

      expect(result.filaBaixa).toBe(0)
    })

    it('deve retornar todos 0 quando groupBy retorna array vazio', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue([])

      const result = await estatisticasUseCase()

      expect(result.porPrioridade).toEqual({
        P1: 0, P2: 0, P3: 0, P4: 0, P5: 0,
      })
      expect(result.filaAlta).toBe(0)
      expect(result.filaBaixa).toBe(0)
    })
  })

  describe('cenários de contadores zerados', () => {
    it('deve retornar 0 quando não há chamados', async () => {
      // count é chamado 7 vezes, então precisa retornar 0 para todas
      vi.mocked(prisma.chamado.count).mockReset()
      vi.mocked(prisma.chamado.count)
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0)  // abertos
        .mockResolvedValueOnce(0)  // emAtendimento
        .mockResolvedValueOnce(0)  // encerrados
        .mockResolvedValueOnce(0)  // cancelados
        .mockResolvedValueOnce(0)  // reabertos
        .mockResolvedValueOnce(0)  // semTecnico
      vi.mocked(prisma.chamado.groupBy).mockReset().mockResolvedValue([])

      const result = await estatisticasUseCase()

      expect(result.total).toBe(0)
      expect(result.porStatus.abertos).toBe(0)
      expect(result.pendentes).toBe(0)
      expect(result.semTecnico).toBe(0)
    })

    it('deve calcular pendentes=0 quando não há abertos nem reabertos', async () => {
      vi.mocked(prisma.chamado.count).mockReset()
      vi.mocked(prisma.chamado.count)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(0)   // abertos
        .mockResolvedValueOnce(50)  // emAtendimento
        .mockResolvedValueOnce(50)  // encerrados
        .mockResolvedValueOnce(0)   // cancelados
        .mockResolvedValueOnce(0)   // reabertos
        .mockResolvedValueOnce(0)   // semTecnico

      vi.mocked(prisma.chamado.groupBy).mockReset().mockResolvedValue(makeGroupByResult() as any)

      const result = await estatisticasUseCase()

      expect(result.pendentes).toBe(0)
    })
  })

  describe('logging', () => {
    it('deve logar sucesso após buscar estatísticas', async () => {
      await estatisticasUseCase()

      expect(logger.info).toHaveBeenCalledWith('[FILA] Estatísticas consultadas')
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await estatisticasUseCase()

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(filaError)

      const error = await estatisticasUseCase().catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar FilaError com code ESTATISTICAS_ERROR quando count falhar', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(new Error('Database error'))

      const error = await estatisticasUseCase().catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('ESTATISTICAS_ERROR')
    })

    it('deve lançar FilaError com code ESTATISTICAS_ERROR quando groupBy falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockReset().mockRejectedValue(new Error('Database error'))

      const error = await estatisticasUseCase().catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('ESTATISTICAS_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(new Error('Database error'))

      const error = await estatisticasUseCase().catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(new Error('Database error'))

      await expect(estatisticasUseCase()).rejects.toThrow('Erro ao buscar estatísticas')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(dbError)

      const error = await estatisticasUseCase().catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue('string error')

      const error = await estatisticasUseCase().catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(dbError)

      await estatisticasUseCase().catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[FILA] Erro ao buscar estatísticas'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(new Error('Database error'))

      await estatisticasUseCase().catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockReset().mockRejectedValue(new Error('Database error'))

      await estatisticasUseCase().catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })
})
