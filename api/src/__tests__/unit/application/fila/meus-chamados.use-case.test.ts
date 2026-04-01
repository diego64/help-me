import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { meusChamadosUseCase } from '@application/use-cases/fila/meus-chamados.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof meusChamadosUseCase>[0] => ({
  page: 1,
  limit: 10,
  usuarioId: 'usuario-id-123',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
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

describe('meusChamadosUseCase', () => {
  describe('filtros da query', () => {
    it('deve sempre filtrar por usuarioId', async () => {
      await meusChamadosUseCase(makeInput({ usuarioId: 'usuario-id-456' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuarioId: 'usuario-id-456' }),
        })
      )
    })

    it('deve filtrar por status quando fornecido e válido', async () => {
      await meusChamadosUseCase(makeInput({ status: 'ABERTO' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ChamadoStatus.ABERTO }),
        })
      )
    })

    it('deve ignorar status quando inválido', async () => {
      await meusChamadosUseCase(makeInput({ status: 'INVALIDO' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('status')
    })

    it('deve aceitar todos os status válidos', async () => {
      const statusValidos = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO']

      for (const status of statusValidos) {
        vi.clearAllMocks()
        vi.mocked(prisma.chamado.count).mockResolvedValue(1)
        vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)

        await meusChamadosUseCase(makeInput({ status }))

        expect(prisma.chamado.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: status as ChamadoStatus }),
          })
        )
      }
    })

    it('deve filtrar por deletadoEm null quando incluirInativos=false', async () => {
      await meusChamadosUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('não deve filtrar por deletadoEm quando incluirInativos=true', async () => {
      await meusChamadosUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve filtrar por deletadoEm null por padrão quando incluirInativos não fornecido', async () => {
      await meusChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('deve aplicar o mesmo where no count e findMany', async () => {
      await meusChamadosUseCase(makeInput({ status: 'ABERTO' }))

      const [countArgs] = vi.mocked(prisma.chamado.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.chamado.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })

    it('deve combinar usuarioId e status quando ambos fornecidos', async () => {
      await meusChamadosUseCase(makeInput({ usuarioId: 'user-789', status: 'EM_ATENDIMENTO' }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usuarioId: 'user-789',
            status: ChamadoStatus.EM_ATENDIMENTO,
          }),
        })
      )
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await meusChamadosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await meusChamadosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await meusChamadosUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve usar take igual ao limit', async () => {
      await meusChamadosUseCase(makeInput({ limit: 25 }))

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 })
      )
    })
  })

  describe('select e ordenação', () => {
    it('deve usar CHAMADO_SELECT', async () => {
      await meusChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: CHAMADO_SELECT })
      )
    })

    it('deve ordenar por geradoEm desc', async () => {
      await meusChamadosUseCase(makeInput())

      expect(prisma.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await meusChamadosUseCase(makeInput())

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

      await meusChamadosUseCase(makeInput())

      expect(countResolved).toBe(true)
      expect(findManyResolved).toBe(true)
    })
  })

  describe('retorno da resposta paginada', () => {
    it('deve retornar data com os chamados', async () => {
      const chamados = [makeChamado(), makeChamado({ id: 'chamado-id-456', OS: 'INC0002' })]
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)
      vi.mocked(prisma.chamado.count).mockResolvedValue(2)

      const result = await meusChamadosUseCase(makeInput())

      expect(result.data).toEqual(chamados)
    })

    it('deve retornar data vazio quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await meusChamadosUseCase(makeInput())

      expect(result.data).toEqual([])
    })

    it('deve retornar pagination com page correto', async () => {
      const result = await meusChamadosUseCase(makeInput({ page: 3 }))

      expect(result.pagination.page).toBe(3)
    })

    it('deve retornar pagination com limit correto', async () => {
      const result = await meusChamadosUseCase(makeInput({ limit: 25 }))

      expect(result.pagination.limit).toBe(25)
    })

    it('deve retornar pagination com total correto', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(42)

      const result = await meusChamadosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await meusChamadosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve retornar totalPages=0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      const result = await meusChamadosUseCase(makeInput())

      expect(result.pagination.totalPages).toBe(0)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await meusChamadosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasNext=false quando é a última página', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)

      const result = await meusChamadosUseCase(makeInput({ page: 3, limit: 10 }))

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasPrev=false quando page=1', async () => {
      const result = await meusChamadosUseCase(makeInput({ page: 1 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true quando page>1', async () => {
      const result = await meusChamadosUseCase(makeInput({ page: 2 }))

      expect(result.pagination.hasPrev).toBe(true)
    })

    it('deve retornar todos os campos do pagination', async () => {
      const result = await meusChamadosUseCase(makeInput())

      expect(result.pagination).toHaveProperty('page')
      expect(result.pagination).toHaveProperty('limit')
      expect(result.pagination).toHaveProperty('total')
      expect(result.pagination).toHaveProperty('totalPages')
      expect(result.pagination).toHaveProperty('hasNext')
      expect(result.pagination).toHaveProperty('hasPrev')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com usuarioId e total', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(15)

      await meusChamadosUseCase(makeInput({ usuarioId: 'usuario-id-789' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-789', total: 15 },
        '[FILA] Meus chamados consultados'
      )
    })

    it('deve logar com total=0 quando não há chamados', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(0)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([])

      await meusChamadosUseCase(makeInput({ usuarioId: 'usuario-id-999' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-999', total: 0 },
        '[FILA] Meus chamados consultados'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await meusChamadosUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar FilaError sem encapsular quando já é FilaError', async () => {
      const filaError = new FilaError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(prisma.chamado.count).mockRejectedValue(filaError)

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBe(filaError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar FilaError com code MEUS_CHAMADOS_ERROR quando count falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('MEUS_CHAMADOS_ERROR')
    })

    it('deve lançar FilaError com code MEUS_CHAMADOS_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.chamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(FilaError)
      expect(error.code).toBe('MEUS_CHAMADOS_ERROR')
    })

    it('deve lançar FilaError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar FilaError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await expect(meusChamadosUseCase(makeInput())).rejects.toThrow(
        'Erro ao listar chamados do usuário'
      )
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue('string error')

      const error = await meusChamadosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.count).mockRejectedValue(dbError)

      await meusChamadosUseCase(makeInput({ usuarioId: 'usuario-id-555' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-555' },
        '[FILA] Erro ao buscar meus chamados'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await meusChamadosUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('Database error'))

      await meusChamadosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('cenários de integração', () => {
    it('deve listar apenas chamados do usuário específico', async () => {
      const chamados = [
        makeChamado({ id: 'chamado-1', usuarioId: 'usuario-id-123' }),
        makeChamado({ id: 'chamado-2', usuarioId: 'usuario-id-123' }),
      ]
      vi.mocked(prisma.chamado.count).mockResolvedValue(2)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue(chamados as any)

      const result = await meusChamadosUseCase(makeInput({ usuarioId: 'usuario-id-123' }))

      expect(result.data).toHaveLength(2)
    })

    it('deve incluir informações completas do usuário', async () => {
      const result = await meusChamadosUseCase(makeInput())

      expect(result.data[0].usuario).toHaveProperty('id')
      expect(result.data[0].usuario).toHaveProperty('nome')
      expect(result.data[0].usuario).toHaveProperty('sobrenome')
      expect(result.data[0].usuario).toHaveProperty('email')
      expect(result.data[0].usuario).toHaveProperty('setor')
    })

    it('deve incluir informações completas do técnico quando atribuído', async () => {
      const result = await meusChamadosUseCase(makeInput())

      expect(result.data[0].tecnico).toHaveProperty('id')
      expect(result.data[0].tecnico).toHaveProperty('nome')
      expect(result.data[0].tecnico).toHaveProperty('sobrenome')
      expect(result.data[0].tecnico).toHaveProperty('email')
    })

    it('deve incluir serviços com informações completas', async () => {
      const result = await meusChamadosUseCase(makeInput())

      expect(result.data[0].servicos).toHaveLength(1)
      expect(result.data[0].servicos[0].servico).toHaveProperty('id')
      expect(result.data[0].servicos[0].servico).toHaveProperty('nome')
      expect(result.data[0].servicos[0].servico).toHaveProperty('descricao')
    })
  })
})
