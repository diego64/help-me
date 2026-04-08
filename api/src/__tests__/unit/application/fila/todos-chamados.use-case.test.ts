import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { todosChamadosUseCase } from '@application/use-cases/fila/todos-chamados.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof todosChamadosUseCase>[0] => ({
  page: 1,
  limit: 10,
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Problema com acesso ao sistema',
  descricaoEncerramento: null,
  status: ChamadoStatus.ABERTO,
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

describe('todosChamadosUseCase', () => {
  describe('validação de status', () => {
    it('deve lançar FilaError quando status for inválido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'INVALIDO' }))).rejects.toThrow(FilaError)
    })

    it('deve lançar FilaError com code INVALID_STATUS quando status inválido', async () => {
      const error = await todosChamadosUseCase(makeInput({ status: 'INVALIDO' })).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar FilaError com statusCode 400 para status inválido', async () => {
      const error = await todosChamadosUseCase(makeInput({ status: 'INVALIDO' })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve lançar FilaError com mensagem "Status inválido"', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'INVALIDO' }))).rejects.toThrow('Status inválido')
    })

    it('deve aceitar status ABERTO válido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'ABERTO' }))).resolves.toBeDefined()
    })

    it('deve aceitar status EM_ATENDIMENTO válido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'EM_ATENDIMENTO' }))).resolves.toBeDefined()
    })

    it('deve aceitar status ENCERRADO válido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'ENCERRADO' }))).resolves.toBeDefined()
    })

    it('deve aceitar status CANCELADO válido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'CANCELADO' }))).resolves.toBeDefined()
    })

    it('deve aceitar status REABERTO válido', async () => {
      await expect(todosChamadosUseCase(makeInput({ status: 'REABERTO' }))).resolves.toBeDefined()
    })
  })

  describe('construção do where', () => {
    it('deve filtrar por status quando fornecido', async () => {
      await todosChamadosUseCase(makeInput({ status: 'ABERTO' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChamadoStatus.ABERTO }),
        })
      )
    })

    it('deve filtrar por tecnicoId quando fornecido', async () => {
      await todosChamadosUseCase(makeInput({ tecnicoId: 'tecnico-id-456' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tecnicoId: 'tecnico-id-456' }),
        })
      )
    })

    it('deve filtrar por usuarioId quando fornecido', async () => {
      await todosChamadosUseCase(makeInput({ usuarioId: 'usuario-id-789' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuarioId: 'usuario-id-789' }),
        })
      )
    })

    it('deve filtrar por setor quando fornecido', async () => {
      await todosChamadosUseCase(makeInput({ setor: 'TI' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuario: { setor: 'TI' } }),
        })
      )
    })

    it('deve filtrar por deletadoEm null quando incluirInativos=false', async () => {
      await todosChamadosUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('não deve filtrar por deletadoEm quando incluirInativos=true', async () => {
      await todosChamadosUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve filtrar por deletadoEm null por padrão quando incluirInativos não fornecido', async () => {
      await todosChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })
  })

  describe('filtro de data', () => {
    it('deve filtrar por dataInicio quando fornecida', async () => {
      await todosChamadosUseCase(makeInput({ dataInicio: '2024-01-01' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            geradoEm: expect.objectContaining({ gte: new Date('2024-01-01') }),
          }),
        })
      )
    })

    it('deve filtrar por dataFim quando fornecida', async () => {
      await todosChamadosUseCase(makeInput({ dataFim: '2024-12-31' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      const dataFimEsperada = new Date('2024-12-31')
      dataFimEsperada.setHours(23, 59, 59, 999)

      expect(args?.where?.geradoEm?.lte).toEqual(dataFimEsperada)
    })

    it('deve filtrar por dataInicio e dataFim juntas', async () => {
      await todosChamadosUseCase(makeInput({ dataInicio: '2024-01-01', dataFim: '2024-12-31' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      const dataFimEsperada = new Date('2024-12-31')
      dataFimEsperada.setHours(23, 59, 59, 999)

      expect(args?.where?.geradoEm?.gte).toEqual(new Date('2024-01-01'))
      expect(args?.where?.geradoEm?.lte).toEqual(dataFimEsperada)
    })

    it('deve ajustar dataFim para incluir todo o dia (23:59:59.999)', async () => {
      await todosChamadosUseCase(makeInput({ dataFim: '2024-01-15' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      const dataFim = args?.where?.geradoEm?.lte

      expect(dataFim?.getHours()).toBe(23)
      expect(dataFim?.getMinutes()).toBe(59)
      expect(dataFim?.getSeconds()).toBe(59)
      expect(dataFim?.getMilliseconds()).toBe(999)
    })

    it('não deve incluir geradoEm quando nenhuma data fornecida', async () => {
      await todosChamadosUseCase(makeInput())

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('geradoEm')
    })
  })

  describe('filtro de busca', () => {
    it('deve buscar por OS quando busca fornecida', async () => {
      await todosChamadosUseCase(makeInput({ busca: 'INC0000001' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { OS: { contains: 'INC0000001', mode: 'insensitive' } },
            ]),
          }),
        })
      )
    })

    it('deve buscar por descricao quando busca fornecida', async () => {
      await todosChamadosUseCase(makeInput({ busca: 'problema' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { descricao: { contains: 'problema', mode: 'insensitive' } },
            ]),
          }),
        })
      )
    })

    it('deve usar busca insensitive', async () => {
      await todosChamadosUseCase(makeInput({ busca: 'TESTE' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where?.OR?.[0]?.OS?.mode).toBe('insensitive')
      expect(args?.where?.OR?.[1]?.descricao?.mode).toBe('insensitive')
    })

    it('não deve incluir OR quando busca não fornecida', async () => {
      await todosChamadosUseCase(makeInput())

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('OR')
    })
  })

  describe('múltiplos filtros combinados', () => {
    it('deve combinar status e tecnicoId', async () => {
      await todosChamadosUseCase(makeInput({ status: 'ABERTO', tecnicoId: 'tec-123' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ChamadoStatus.ABERTO,
            tecnicoId: 'tec-123',
          }),
        })
      )
    })

    it('deve combinar todos os filtros simultaneamente', async () => {
      await todosChamadosUseCase(
        makeInput({
          status: 'EM_ATENDIMENTO',
          tecnicoId: 'tec-123',
          usuarioId: 'user-456',
          setor: 'TI',
          busca: 'problema',
          dataInicio: '2024-01-01',
          dataFim: '2024-12-31',
        })
      )

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []

      expect(args?.where?.status).toBe(ChamadoStatus.EM_ATENDIMENTO)
      expect(args?.where?.tecnicoId).toBe('tec-123')
      expect(args?.where?.usuarioId).toBe('user-456')
      expect(args?.where?.usuario).toEqual({ setor: 'TI' })
      expect(args?.where?.OR).toBeDefined()
      expect(args?.where?.geradoEm).toBeDefined()
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await todosChamadosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await todosChamadosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await todosChamadosUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve usar take igual ao limit', async () => {
      await todosChamadosUseCase(makeInput({ limit: 25 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      )
    })
  })

  describe('select e ordenação', () => {
    it('deve usar CHAMADO_SELECT', async () => {
      await todosChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: CHAMADO_SELECT })
      )
    })

    it('deve ordenar por geradoEm desc', async () => {
      await todosChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await todosChamadosUseCase(makeInput())

      expect(prisma.chamado.count).toHaveBeenCalledTimes(1)
      expect(prisma.chamado.findMany).toHaveBeenCalledTimes(1)
    })

    it('deve aplicar o mesmo where no count e findMany', async () => {
      await todosChamadosUseCase(makeInput({ status: 'ABERTO', tecnicoId: 'tec-123' }))

      const [countArgs] = vi.mocked(prisma.chamado.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('retorno da resposta paginada', () => {
    it('deve retornar data com os chamados', async () => {
      const chamados = [makeChamado(), makeChamado({ id: 'chamado-id-456', OS: 'INC0000002' })]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)
      vi.mocked(prisma.chamado.count).mockResolvedValue(2)

      const result = await todosChamadosUseCase(makeInput())

      expect(result.data).toEqual(chamados)
    })

    it('deve retornar data vazio quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await todosChamadosUseCase(makeInput())

      expect(result.data).toEqual([])
    })

    it('deve retornar pagination com page correto', async () => {
      const result = await todosChamadosUseCase(makeInput({ page: 3 }))

      expect(result.pagination.page).toBe(3)
    })

    it('deve retornar pagination com limit correto', async () => {
      const result = await todosChamadosUseCase(makeInput({ limit: 25 }))

      expect(result.pagination.limit).toBe(25)
    })

    it('deve retornar pagination com total correto', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(42)

      const result = await todosChamadosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await todosChamadosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await todosChamadosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasNext=false quando é a última página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await todosChamadosUseCase(makeInput({ page: 3, limit: 10 }))

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasPrev=false quando page=1', async () => {
      const result = await todosChamadosUseCase(makeInput({ page: 1 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true quando page>1', async () => {
      const result = await todosChamadosUseCase(makeInput({ page: 2 }))

      expect(result.pagination.hasPrev).toBe(true)
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com total, page e limit', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(15)

      await todosChamadosUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { total: 15, page: 2, limit: 5 },
        '[FILA] Todos os chamados consultados'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await todosChamadosUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.count).mockRejectedValue(filaError)

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve relançar FilaError de validação de status', async () => {
      const error = await todosChamadosUseCase(makeInput({ status: 'INVALIDO' })).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar FilaError com code TODOS_CHAMADOS_ERROR quando count falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('TODOS_CHAMADOS_ERROR')
    })

    it('deve lançar FilaError com code TODOS_CHAMADOS_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.chamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('TODOS_CHAMADOS_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await expect(todosChamadosUseCase(makeInput())).rejects.toThrow('Erro ao listar chamados')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue('string error')

      const error = await todosChamadosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      await todosChamadosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[FILA] Erro ao listar todos os chamados'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await todosChamadosUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})
