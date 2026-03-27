import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client'

import { resumoFilaUseCase } from '@application/use-cases/fila/resumo-fila.use-case'
import { FilaError } from '@application/use-cases/fila/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      groupBy: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof resumoFilaUseCase>[0] => ({
  usuarioId: 'usuario-id-123',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nivel: NivelTecnico.N1,
  ...overrides,
})

const makeGroupByResult = (prioridades: Array<{ prioridade: PrioridadeChamado; count: number }> = []) => {
  if (prioridades.length === 0) {
    return [
      { prioridade: 'P1' as PrioridadeChamado, _count: { id: 2 } },
      { prioridade: 'P2' as PrioridadeChamado, _count: { id: 3 } },
      { prioridade: 'P3' as PrioridadeChamado, _count: { id: 5 } },
      { prioridade: 'P4' as PrioridadeChamado, _count: { id: 10 } },
      { prioridade: 'P5' as PrioridadeChamado, _count: { id: 15 } },
    ]
  }

  return prioridades.map(({ prioridade, count }) => ({
    prioridade,
    _count: { id: count },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.chamado.groupBy).mockResolvedValue(makeGroupByResult() as any)
})

describe('resumoFilaUseCase', () => {
  describe('controle de acesso para ADMIN', () => {
    it('deve mostrar ambas as filas para ADMIN', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas).toHaveProperty('alta')
      expect(result.filas).toHaveProperty('baixa')
    })

    it('não deve buscar nível do usuário quando regra é ADMIN', async () => {
      await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('deve calcular totalGeral corretamente para ADMIN', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      // P1(2) + P2(3) + P3(5) = 10 (alta)
      // P4(10) + P5(15) = 25 (baixa)
      // Total = 35
      expect(result.totalGeral).toBe(35)
    })
  })

  describe('controle de acesso para técnico N1', () => {
    it('deve mostrar apenas fila baixa para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(result.filas).not.toHaveProperty('alta')
      expect(result.filas).toHaveProperty('baixa')
    })

    it('deve calcular totalGeral com apenas baixa para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      // P4(10) + P5(15) = 25 (apenas baixa)
      expect(result.totalGeral).toBe(25)
    })

    it('deve buscar nível do usuário quando regra é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tecnico-id-456' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'tecnico-id-456' },
        select: { nivel: true },
      })
    })
  })

  describe('controle de acesso para técnico N2', () => {
    it('deve mostrar apenas fila alta para técnico N2', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N2 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(result.filas).toHaveProperty('alta')
      expect(result.filas).not.toHaveProperty('baixa')
    })

    it('deve calcular totalGeral com apenas alta para técnico N2', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N2 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      // P1(2) + P2(3) + P3(5) = 10 (apenas alta)
      expect(result.totalGeral).toBe(10)
    })
  })

  describe('controle de acesso para técnico N3', () => {
    it('deve mostrar apenas fila alta para técnico N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N3 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(result.filas).toHaveProperty('alta')
      expect(result.filas).not.toHaveProperty('baixa')
    })

    it('deve calcular totalGeral com apenas alta para técnico N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N3 }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      // P1(2) + P2(3) + P3(5) = 10 (apenas alta)
      expect(result.totalGeral).toBe(10)
    })
  })

  describe('query de groupBy', () => {
    it('deve filtrar por status ABERTO e REABERTO', async () => {
      await resumoFilaUseCase(makeInput())

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO] },
          }),
        })
      )
    })

    it('deve filtrar por deletadoEm null', async () => {
      await resumoFilaUseCase(makeInput())

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('deve filtrar por todas as prioridades para ADMIN', async () => {
      await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prioridade: { in: ['P1', 'P2', 'P3', 'P4', 'P5'] },
          }),
        })
      )
    })

    it('deve filtrar apenas por P4 e P5 para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prioridade: { in: ['P4', 'P5'] },
          }),
        })
      )
    })

    it('deve filtrar apenas por P1, P2 e P3 para técnico N2', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N2 }) as any)

      await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prioridade: { in: ['P1', 'P2', 'P3'] },
          }),
        })
      )
    })

    it('deve agrupar por prioridade', async () => {
      await resumoFilaUseCase(makeInput())

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['prioridade'],
        })
      )
    })

    it('deve contar por id', async () => {
      await resumoFilaUseCase(makeInput())

      expect(prisma.chamado.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          _count: { id: true },
        })
      )
    })
  })

  describe('estrutura da resposta para fila alta', () => {
    it('deve incluir total da fila alta', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.alta?.total).toBe(10) // P1(2) + P2(3) + P3(5)
    })

    it('deve incluir prioridades P1, P2, P3 com contadores corretos', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.alta?.prioridades).toEqual({ P1: 2, P2: 3, P3: 5 })
    })

    it('deve retornar 0 para prioridades ausentes na fila alta', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue(
        makeGroupByResult([{ prioridade: 'P1' as PrioridadeChamado, count: 5 }]) as any
      )

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.alta?.prioridades).toEqual({ P1: 5, P2: 0, P3: 0 })
    })
  })

  describe('estrutura da resposta para fila baixa', () => {
    it('deve incluir total da fila baixa', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.baixa?.total).toBe(25) // P4(10) + P5(15)
    })

    it('deve incluir prioridades P4, P5 com contadores corretos', async () => {
      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.baixa?.prioridades).toEqual({ P4: 10, P5: 15 })
    })

    it('deve retornar 0 para prioridades ausentes na fila baixa', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue(
        makeGroupByResult([{ prioridade: 'P4' as PrioridadeChamado, count: 20 }]) as any
      )

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.baixa?.prioridades).toEqual({ P4: 20, P5: 0 })
    })
  })

  describe('cenários com dados zerados', () => {
    it('deve retornar totalGeral=0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue([])

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.totalGeral).toBe(0)
    })

    it('deve retornar todas prioridades com 0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue([])

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.alta?.prioridades).toEqual({ P1: 0, P2: 0, P3: 0 })
      expect(result.filas.baixa?.prioridades).toEqual({ P4: 0, P5: 0 })
    })

    it('deve retornar total=0 para fila alta quando não há chamados', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue([])

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.alta?.total).toBe(0)
    })

    it('deve retornar total=0 para fila baixa quando não há chamados', async () => {
      vi.mocked(prisma.chamado.groupBy).mockResolvedValue([])

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(result.filas.baixa?.total).toBe(0)
    })
  })

  describe('cenários com técnico sem nível definido', () => {
    it('deve tratar técnico sem nível como sem permissões', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: null }) as any)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(result.filas).not.toHaveProperty('alta')
      expect(result.filas).not.toHaveProperty('baixa')
      expect(result.totalGeral).toBe(0)
    })

    it('deve tratar técnico inexistente como sem permissões', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const result = await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))

      expect(result.filas).not.toHaveProperty('alta')
      expect(result.filas).not.toHaveProperty('baixa')
      expect(result.totalGeral).toBe(0)
    })
  })

  describe('logging', () => {
    it('deve logar com usuarioId e flags de visibilidade', async () => {
      await resumoFilaUseCase(makeInput({ usuarioId: 'usuario-id-789' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-789', mostrarAlta: true, mostrarBaixa: true },
        '[FILA] Resumo consultado'
      )
    })

    it('deve logar mostrarAlta=true e mostrarBaixa=false para técnico N2', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N2 }) as any)

      await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tec-456' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'tec-456', mostrarAlta: true, mostrarBaixa: false },
        '[FILA] Resumo consultado'
      )
    })

    it('deve logar mostrarAlta=false e mostrarBaixa=true para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      await resumoFilaUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tec-789' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'tec-789', mostrarAlta: false, mostrarBaixa: true },
        '[FILA] Resumo consultado'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await resumoFilaUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(filaError)

      const error = await resumoFilaUseCase(makeInput()).catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar FilaError com code RESUMO_ERROR quando groupBy falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(new Error('Database error'))

      const error = await resumoFilaUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('RESUMO_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(new Error('Database error'))

      const error = await resumoFilaUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(new Error('Database error'))

      await expect(resumoFilaUseCase(makeInput())).rejects.toThrow('Erro ao buscar resumo das filas')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(dbError)

      const error = await resumoFilaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue('string error')

      const error = await resumoFilaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(dbError)

      await resumoFilaUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith({ error: dbError }, '[FILA] Erro ao buscar resumo')
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(new Error('Database error'))

      await resumoFilaUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(prisma.chamado.groupBy).mockRejectedValue(new Error('Database error'))

      await resumoFilaUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })
})
