import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client'

import { filaAltaUseCase } from '@application/use-cases/fila/fila-alta.use-case'
import { FilaError } from '@application/use-cases/fila/errors'
import { FILA_SELECT } from '@application/use-cases/fila/selects'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      count: vi.fn(),
      findMany: vi.fn(),
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

const DATA_FIXA_1 = new Date('2024-01-01T10:00:00.000Z')
const DATA_FIXA_2 = new Date('2024-01-01T11:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof filaAltaUseCase>[0] => ({
  page: 1,
  limit: 10,
  usuarioId: 'usuario-id-123',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Problema crítico no servidor',
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P2,
  geradoEm: DATA_FIXA_1,
  atualizadoEm: DATA_FIXA_1,
  usuario: {
    id: 'usuario-id-123',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
  },
  tecnico: null,
  servicos: [
    {
      servico: {
        id: 'servico-id-123',
        nome: 'Infraestrutura',
      },
    },
  ],
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nivel: NivelTecnico.N2,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.chamado.count).mockResolvedValue(1)
  vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)
})

describe('filaAltaUseCase', () => {
  describe('controle de acesso por nível de técnico', () => {
    it('deve permitir acesso para ADMIN', async () => {
      await expect(filaAltaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))).resolves.toBeDefined()
    })

    it('deve permitir acesso para técnico N2', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N2 }) as any)

      await expect(
        filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir acesso para técnico N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N3 }) as any)

      await expect(
        filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve bloquear acesso para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      await expect(
        filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(FilaError)
    })

    it('deve lançar FilaError com code FORBIDDEN para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      const error = await filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar FilaError com statusCode 403 para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      const error = await filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve lançar erro com mensagem específica para técnico N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      await expect(
        filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow('Técnicos N1 não têm acesso à fila de alta prioridade')
    })

    it('não deve buscar nível do usuário quando regra é ADMIN', async () => {
      await filaAltaUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('deve buscar nível do usuário quando regra é TECNICO', async () => {
      await filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tecnico-id-456' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'tecnico-id-456' },
        select: { nivel: true },
      })
    })
  })

  describe('filtros da query', () => {
    it('deve filtrar por status ABERTO e REABERTO', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO] },
          }),
        })
      )
    })

    it('deve filtrar por prioridade P1, P2 e P3', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prioridade: { in: ['P1', 'P2', 'P3'] },
          }),
        })
      )
    })

    it('deve filtrar por deletadoEm null', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('deve aplicar o mesmo where no count e findMany', async () => {
      await filaAltaUseCase(makeInput())

      const [countArgs] = vi.mocked(prisma.chamado.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await filaAltaUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await filaAltaUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await filaAltaUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve usar take igual ao limit', async () => {
      await filaAltaUseCase(makeInput({ limit: 25 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      )
    })
  })

  describe('select e ordenação', () => {
    it('deve usar FILA_SELECT', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: FILA_SELECT })
      )
    })

    it('deve ordenar por geradoEm asc no banco', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'asc' } })
      )
    })
  })

  describe('ordenação customizada', () => {
    it('deve reordenar chamados por prioridade e depois por data', async () => {
      const chamados = [
        makeChamado({ id: 'c1', prioridade: PrioridadeChamado.P3, geradoEm: DATA_FIXA_1 }),
        makeChamado({ id: 'c2', prioridade: PrioridadeChamado.P1, geradoEm: DATA_FIXA_2 }),
        makeChamado({ id: 'c3', prioridade: PrioridadeChamado.P1, geradoEm: DATA_FIXA_1 }),
      ]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await filaAltaUseCase(makeInput())

      // P1 (mais antiga) -> P1 (mais recente) -> P3
      expect(result.data[0].id).toBe('c3')
      expect(result.data[1].id).toBe('c2')
      expect(result.data[2].id).toBe('c1')
    })

    it('deve ordenar por prioridade quando datas iguais', async () => {
      const chamados = [
        makeChamado({ id: 'c1', prioridade: PrioridadeChamado.P3, geradoEm: DATA_FIXA_1 }),
        makeChamado({ id: 'c2', prioridade: PrioridadeChamado.P1, geradoEm: DATA_FIXA_1 }),
      ]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await filaAltaUseCase(makeInput())

      expect(result.data[0].id).toBe('c2') // P1 vem antes de P3
      expect(result.data[1].id).toBe('c1')
    })

    it('deve ordenar por data quando mesma prioridade', async () => {
      const chamados = [
        makeChamado({ id: 'c1', prioridade: PrioridadeChamado.P2, geradoEm: DATA_FIXA_2 }),
        makeChamado({ id: 'c2', prioridade: PrioridadeChamado.P2, geradoEm: DATA_FIXA_1 }),
      ]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await filaAltaUseCase(makeInput())

      expect(result.data[0].id).toBe('c2') // Mais antigo vem primeiro
      expect(result.data[1].id).toBe('c1')
    })

    it('deve ordenar P1, P2, P3 corretamente', async () => {
      const chamados = [
        makeChamado({ id: 'c1', prioridade: PrioridadeChamado.P3, geradoEm: DATA_FIXA_1 }),
        makeChamado({ id: 'c2', prioridade: PrioridadeChamado.P2, geradoEm: DATA_FIXA_1 }),
        makeChamado({ id: 'c3', prioridade: PrioridadeChamado.P1, geradoEm: DATA_FIXA_1 }),
      ]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await filaAltaUseCase(makeInput())

      expect(result.data[0].id).toBe('c3') // P1
      expect(result.data[1].id).toBe('c2') // P2
      expect(result.data[2].id).toBe('c1') // P3
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await filaAltaUseCase(makeInput())

      expect(prisma.chamado.count).toHaveBeenCalledTimes(1)
      expect(prisma.chamado.findMany).toHaveBeenCalledTimes(1)
    })

    it('deve executar count e findMany em paralelo com Promise.all', async () => {
      const countSpy = vi.mocked(prisma.chamado.count)
      const findManySpy = vi.mocked(prisma.chamado.findMany)

      let countResolved = false
      let findManyResolved = false

      countSpy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        countResolved = true
        return 5
      })

      findManySpy.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        findManyResolved = true
        return [makeChamado()] as any
      })

      await filaAltaUseCase(makeInput())

      expect(countResolved).toBe(true)
      expect(findManyResolved).toBe(true)
    })
  })

  describe('retorno da resposta', () => {
    it('deve retornar fila="ALTA"', async () => {
      const result = await filaAltaUseCase(makeInput())

      expect(result.fila).toBe('ALTA')
    })

    it('deve retornar prioridades [P1, P2, P3]', async () => {
      const result = await filaAltaUseCase(makeInput())

      expect(result.prioridades).toEqual(['P1', 'P2', 'P3'])
    })

    it('deve retornar data com chamados formatados', async () => {
      const result = await filaAltaUseCase(makeInput())

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('id')
      expect(result.data[0]).toHaveProperty('OS')
      expect(result.data[0]).toHaveProperty('tempoEspera')
    })

    it('deve retornar pagination com page correto', async () => {
      const result = await filaAltaUseCase(makeInput({ page: 3 }))

      expect(result.pagination.page).toBe(3)
    })

    it('deve retornar pagination com limit correto', async () => {
      const result = await filaAltaUseCase(makeInput({ limit: 25 }))

      expect(result.pagination.limit).toBe(25)
    })

    it('deve retornar pagination com total correto', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(42)

      const result = await filaAltaUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await filaAltaUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await filaAltaUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasNext=false quando é a última página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await filaAltaUseCase(makeInput({ page: 3, limit: 10 }))

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasPrev=false quando page=1', async () => {
      const result = await filaAltaUseCase(makeInput({ page: 1 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true quando page>1', async () => {
      const result = await filaAltaUseCase(makeInput({ page: 2 }))

      expect(result.pagination.hasPrev).toBe(true)
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com page, limit e total', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(15)

      await filaAltaUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { page: 2, limit: 5, total: 15 },
        '[FILA] Fila alta consultada'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await filaAltaUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.count).mockRejectedValue(filaError)

      const error = await filaAltaUseCase(makeInput()).catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve relançar FilaError de controle de acesso', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: NivelTecnico.N1 }) as any)

      const error = await filaAltaUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar FilaError com code FILA_ALTA_ERROR quando count falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await filaAltaUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('FILA_ALTA_ERROR')
    })

    it('deve lançar FilaError com code FILA_ALTA_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.chamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await filaAltaUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('FILA_ALTA_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await filaAltaUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await expect(filaAltaUseCase(makeInput())).rejects.toThrow(
        'Erro ao buscar fila de alta prioridade'
      )
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      const error = await filaAltaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue('string error')

      const error = await filaAltaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      await filaAltaUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[FILA] Erro ao buscar fila alta'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await filaAltaUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})
