import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { chamadosAtribuidosUseCase } from '@application/use-cases/fila/chamados-atribuidos.use-case'
import { FilaError } from '@application/use-cases/fila/errors'
import { CHAMADO_SELECT } from '@application/use-cases/fila/selects'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      count: vi.fn(),
      findMany: vi.fn(),
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

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof chamadosAtribuidosUseCase>[0] => ({
  page: 1,
  limit: 10,
  tecnicoId: 'tecnico-id-123',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Problema com acesso ao sistema',
  descricaoEncerramento: null,
  status: ChamadoStatus.EM_ATENDIMENTO,
  prioridade: PrioridadeChamado.P3,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  encerradoEm: null,
  deletadoEm: null,
  usuario: {
    id: 'usuario-id-123',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
    setor: 'TI',
  },
  tecnico: {
    id: 'tecnico-id-123',
    nome: 'Tecnico',
    sobrenome: 'Silva',
    email: 'tecnico@email.com',
  },
  servicos: [
    {
      id: 'chamado-servico-id-1',
      servicoId: 'servico-id-123',
      servico: {
        id: 'servico-id-123',
        nome: 'Suporte TI',
        descricao: 'Serviço de suporte técnico',
      },
    },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.chamado.count).mockResolvedValue(1)
  vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)
})

describe('chamadosAtribuidosUseCase', () => {
  describe('filtros da query', () => {
    it('deve filtrar por tecnicoId', async () => {
      await chamadosAtribuidosUseCase(makeInput({ tecnicoId: 'tecnico-id-456' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tecnicoId: 'tecnico-id-456' }),
        })
      )
    })

    it('deve filtrar por status EM_ATENDIMENTO e REABERTO', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO] },
          }),
        })
      )
    })

    it('deve filtrar por deletadoEm null', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('deve aplicar o mesmo where no count e no findMany', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      const [countArgs] = vi.mocked(prisma.chamado.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })

    it('deve construir where com todos os campos obrigatórios', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tecnicoId: 'tecnico-id-123',
            status: { in: [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO] },
            deletadoEm: null,
          },
        })
      )
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await chamadosAtribuidosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await chamadosAtribuidosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await chamadosAtribuidosUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve calcular skip corretamente para page=5 com limit=20', async () => {
      await chamadosAtribuidosUseCase(makeInput({ page: 5, limit: 20 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 80, take: 20 })
      )
    })

    it('deve usar take igual ao limit', async () => {
      await chamadosAtribuidosUseCase(makeInput({ limit: 25 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      )
    })
  })

  describe('select e ordenação', () => {
    it('deve usar CHAMADO_SELECT', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: CHAMADO_SELECT })
      )
    })

    it('deve ordenar por geradoEm desc quando ordenacao não é fornecida', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })

    it('deve ordenar por geradoEm desc quando ordenacao é undefined', async () => {
      await chamadosAtribuidosUseCase(makeInput({ ordenacao: undefined }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })

    it('deve ordenar por geradoEm asc quando ordenacao="antigos"', async () => {
      await chamadosAtribuidosUseCase(makeInput({ ordenacao: 'antigos' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'asc' } })
      )
    })

    it('deve ordenar por status desc e geradoEm desc quando ordenacao="reabertos"', async () => {
      await chamadosAtribuidosUseCase(makeInput({ ordenacao: 'reabertos' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ status: 'desc' }, { geradoEm: 'desc' }],
        })
      )
    })

    it('deve ordenar por geradoEm desc quando ordenacao não é reconhecida', async () => {
      await chamadosAtribuidosUseCase(makeInput({ ordenacao: 'invalido' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.count).toHaveBeenCalledTimes(1)
      expect(prisma.chamado.findMany).toHaveBeenCalledTimes(1)
    })

    it('deve executar count e findMany em paralelo com Promise.all', async () => {
      let countCalled = false
      let findManyCalled = false

      vi.mocked(prisma.chamado.count).mockResolvedValue(5)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)

      // Verifica se ambos foram chamados (paralelo implícito via Promise.all)
      await chamadosAtribuidosUseCase(makeInput())

      expect(prisma.chamado.count).toHaveBeenCalledTimes(1)
      expect(prisma.chamado.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno da resposta paginada', () => {
    it('deve retornar data com os chamados', async () => {
      const chamados = [makeChamado(), makeChamado({ id: 'chamado-id-456', OS: 'INC0000002' })]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data).toEqual(chamados)
    })

    it('deve retornar data vazio quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data).toEqual([])
    })

    it('deve retornar pagination com page correto', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput({ page: 3 }))

      expect(result.pagination.page).toBe(3)
    })

    it('deve retornar pagination com limit correto', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput({ limit: 25 }))

      expect(result.pagination.limit).toBe(25)
    })

    it('deve retornar pagination com total correto', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(42)

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await chamadosAtribuidosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve calcular totalPages arredondando para cima', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(11)

      const result = await chamadosAtribuidosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(2)
    })

    it('deve retornar totalPages=0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.pagination.totalPages).toBe(0)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await chamadosAtribuidosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasNext=false quando é a última página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await chamadosAtribuidosUseCase(makeInput({ page: 3, limit: 10 }))

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasNext=false quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasPrev=false quando page=1', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput({ page: 1 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true quando page>1', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput({ page: 2 }))

      expect(result.pagination.hasPrev).toBe(true)
    })

    it('deve retornar todos os campos do pagination', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.pagination).toHaveProperty('page')
      expect(result.pagination).toHaveProperty('limit')
      expect(result.pagination).toHaveProperty('total')
      expect(result.pagination).toHaveProperty('totalPages')
      expect(result.pagination).toHaveProperty('hasNext')
      expect(result.pagination).toHaveProperty('hasPrev')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com tecnicoId e total', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(15)

      await chamadosAtribuidosUseCase(makeInput({ tecnicoId: 'tecnico-id-789' }))

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-789', total: 15 },
        '[FILA] Chamados atribuídos consultados'
      )
    })

    it('deve logar com total=0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      await chamadosAtribuidosUseCase(makeInput({ tecnicoId: 'tecnico-id-999' }))

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-999', total: 0 },
        '[FILA] Chamados atribuídos consultados'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await chamadosAtribuidosUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.count).mockRejectedValue(filaError)

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar FilaError com code ATRIBUIDOS_ERROR quando count falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('ATRIBUIDOS_ERROR')
    })

    it('deve lançar FilaError com code ATRIBUIDOS_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.chamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('ATRIBUIDOS_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await expect(chamadosAtribuidosUseCase(makeInput())).rejects.toThrow(
        'Erro ao listar chamados do técnico'
      )
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue('string error')

      const error = await chamadosAtribuidosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      await chamadosAtribuidosUseCase(makeInput({ tecnicoId: 'tecnico-id-555' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-555' },
        '[FILA] Erro ao buscar chamados atribuídos'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await chamadosAtribuidosUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await chamadosAtribuidosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('cenários de integração', () => {
    it('deve listar apenas chamados EM_ATENDIMENTO do técnico', async () => {
      const chamados = [
        makeChamado({ id: 'chamado-1', status: ChamadoStatus.EM_ATENDIMENTO }),
        makeChamado({ id: 'chamado-2', status: ChamadoStatus.EM_ATENDIMENTO }),
      ]
      vi.mocked(prisma.chamado.count).mockResolvedValue(2)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data).toHaveLength(2)
      expect(result.data.every(c => c.status === ChamadoStatus.EM_ATENDIMENTO)).toBe(true)
    })

    it('deve listar apenas chamados REABERTOS do técnico', async () => {
      const chamados = [
        makeChamado({ id: 'chamado-1', status: ChamadoStatus.REABERTO }),
        makeChamado({ id: 'chamado-2', status: ChamadoStatus.REABERTO }),
      ]
      vi.mocked(prisma.chamado.count).mockResolvedValue(2)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data).toHaveLength(2)
      expect(result.data.every(c => c.status === ChamadoStatus.REABERTO)).toBe(true)
    })

    it('deve listar mix de chamados EM_ATENDIMENTO e REABERTOS', async () => {
      const chamados = [
        makeChamado({ id: 'chamado-1', status: ChamadoStatus.EM_ATENDIMENTO }),
        makeChamado({ id: 'chamado-2', status: ChamadoStatus.REABERTO }),
        makeChamado({ id: 'chamado-3', status: ChamadoStatus.EM_ATENDIMENTO }),
      ]
      vi.mocked(prisma.chamado.count).mockResolvedValue(3)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data).toHaveLength(3)
      expect(result.data[0].status).toBe(ChamadoStatus.EM_ATENDIMENTO)
      expect(result.data[1].status).toBe(ChamadoStatus.REABERTO)
    })

    it('deve respeitar o limit na paginação', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(100)
      const chamados = Array.from({ length: 5 }, (_, i) =>
        makeChamado({ id: `chamado-${i}` })
      )
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await chamadosAtribuidosUseCase(makeInput({ limit: 5 }))

      expect(result.data).toHaveLength(5)
      expect(result.pagination.total).toBe(100)
      expect(result.pagination.totalPages).toBe(20)
    })

    it('deve incluir informações completas do usuário', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data[0].usuario).toHaveProperty('id')
      expect(result.data[0].usuario).toHaveProperty('nome')
      expect(result.data[0].usuario).toHaveProperty('sobrenome')
      expect(result.data[0].usuario).toHaveProperty('email')
      expect(result.data[0].usuario).toHaveProperty('setor')
    })

    it('deve incluir informações completas do técnico', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data[0].tecnico).toHaveProperty('id')
      expect(result.data[0].tecnico).toHaveProperty('nome')
      expect(result.data[0].tecnico).toHaveProperty('sobrenome')
      expect(result.data[0].tecnico).toHaveProperty('email')
    })

    it('deve incluir serviços com informações completas', async () => {
      const result = await chamadosAtribuidosUseCase(makeInput())

      expect(result.data[0].servicos).toHaveLength(1)
      expect(result.data[0].servicos[0].servico).toHaveProperty('id')
      expect(result.data[0].servicos[0].servico).toHaveProperty('nome')
      expect(result.data[0].servicos[0].servico).toHaveProperty('descricao')
    })
  })
})
