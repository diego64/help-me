import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarNotificacoesUseCase } from '@application/use-cases/notificacao/listar-notificacoes.use-case'
import { NotificacaoError } from '@application/use-cases/notificacao/errors'
import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof listarNotificacoesUseCase>[0] => ({
  usuarioId: 'usuario-id-123',
  page: 1,
  limit: 10,
  apenasNaoLidas: false,
  ...overrides,
})

const makeNotificacao = (overrides = {}) => ({
  _id: 'notif-id-123',
  titulo: 'Novo chamado atribuído',
  mensagem: 'Você recebeu um novo chamado',
  tipo: 'ATRIBUICAO',
  destinatarioId: 'usuario-id-123',
  lida: false,
  lidaEm: null,
  criadoEm: DATA_FIXA_1,
  ...overrides,
})

const makeFindChain = (resolvedValue = [makeNotificacao()]) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(resolvedValue),
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(NotificacaoModel.find).mockReturnValue(makeFindChain() as any)
  // mockResolvedValue (sem Once) como fallback — testes específicos sobrescrevem com Once
  vi.mocked(NotificacaoModel.countDocuments).mockResolvedValue(1 as any)
})

describe('listarNotificacoesUseCase', () => {
  describe('filtros da query', () => {
    it('deve filtrar find por destinatarioId', async () => {
      await listarNotificacoesUseCase(makeInput({ usuarioId: 'usuario-456' }))

      expect(NotificacaoModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'usuario-456' })
      )
    })

    it('deve filtrar apenas por destinatarioId quando apenasNaoLidas=false', async () => {
      await listarNotificacoesUseCase(makeInput({ apenasNaoLidas: false }))

      expect(NotificacaoModel.find).toHaveBeenCalledWith({ destinatarioId: 'usuario-id-123' })
    })

    it('deve incluir lida=false no filtro quando apenasNaoLidas=true', async () => {
      await listarNotificacoesUseCase(makeInput({ apenasNaoLidas: true }))

      expect(NotificacaoModel.find).toHaveBeenCalledWith({
        destinatarioId: 'usuario-id-123',
        lida: false,
      })
    })

    it('deve usar o mesmo filtro no countDocuments do total e no find', async () => {
      await listarNotificacoesUseCase(makeInput({ apenasNaoLidas: true }))

      const [countArgs] = vi.mocked(NotificacaoModel.countDocuments).mock.calls[0] ?? []
      const [findArgs] = vi.mocked(NotificacaoModel.find).mock.calls[0] ?? []

      expect(countArgs).toEqual(findArgs)
    })

    it('deve sempre contar naoLidas com lida=false independente de apenasNaoLidas', async () => {
      await listarNotificacoesUseCase(makeInput({ apenasNaoLidas: false, usuarioId: 'usuario-789' }))

      expect(NotificacaoModel.countDocuments).toHaveBeenCalledWith({
        destinatarioId: 'usuario-789',
        lida: false,
      })
    })
  })

  describe('paginação', () => {
    it.each([
      { page: 1, limit: 10, expectedSkip: 0 },
      { page: 2, limit: 10, expectedSkip: 10 },
      { page: 3, limit: 5,  expectedSkip: 10 },
      { page: 5, limit: 20, expectedSkip: 80 },
    ])('page=$page limit=$limit → skip=$expectedSkip', async ({ page, limit, expectedSkip }) => {
      const chain = makeFindChain()
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      await listarNotificacoesUseCase(makeInput({ page, limit }))

      expect(chain.skip).toHaveBeenCalledWith(expectedSkip)
      expect(chain.limit).toHaveBeenCalledWith(limit)
    })
  })

  describe('ordenação e encadeamento', () => {
    it('deve ordenar por criadoEm desc', async () => {
      const chain = makeFindChain()
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      await listarNotificacoesUseCase(makeInput())

      expect(chain.sort).toHaveBeenCalledWith({ criadoEm: -1 })
    })

    it('deve encadear sort → skip → limit → lean nessa ordem', async () => {
      const chain = makeFindChain()
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      await listarNotificacoesUseCase(makeInput())

      const order = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0]!

      expect(order(chain.sort)).toBeLessThan(order(chain.skip))
      expect(order(chain.skip)).toBeLessThan(order(chain.limit))
      expect(order(chain.limit)).toBeLessThan(order(chain.lean))
    })

    it('deve chamar lean para retornar objetos JavaScript puros', async () => {
      const chain = makeFindChain()
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      await listarNotificacoesUseCase(makeInput())

      expect(chain.lean).toHaveBeenCalledTimes(1)
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar countDocuments duas vezes e find uma vez', async () => {
      await listarNotificacoesUseCase(makeInput())

      expect(NotificacaoModel.countDocuments).toHaveBeenCalledTimes(2)
      expect(NotificacaoModel.find).toHaveBeenCalledTimes(1)
    })

    it('deve executar as três operações em paralelo via Promise.all', async () => {
      const countSpy = vi.mocked(NotificacaoModel.countDocuments)
      const chain = makeFindChain()
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      let count1Resolved = false
      let count2Resolved = false
      let findResolved = false

      const impl1 = async () => { await new Promise(r => setTimeout(r, 10)); count1Resolved = true; return 10 }
      const impl2 = async () => { await new Promise(r => setTimeout(r, 10)); count2Resolved = true; return 5 }
      const findImpl = async () => { await new Promise(r => setTimeout(r, 10)); findResolved = true; return [makeNotificacao()] }

      countSpy.mockImplementation(impl1 as any)
      // segunda chamada usa impl2
      countSpy.mockImplementationOnce(impl1 as any).mockImplementationOnce(impl2 as any)
      chain.lean.mockImplementation(findImpl)

      await listarNotificacoesUseCase(makeInput())

      expect(count1Resolved).toBe(true)
      expect(count2Resolved).toBe(true)
      expect(findResolved).toBe(true)
    })
  })

  describe('retorno', () => {
    it('deve retornar os chamados em data', async () => {
      const notificacoes = [makeNotificacao({ _id: 'n1' }), makeNotificacao({ _id: 'n2' })]
      const chain = makeFindChain(notificacoes)
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      const result = await listarNotificacoesUseCase(makeInput())

      expect(result.data).toEqual(notificacoes)
    })

    it('deve retornar data vazio quando não há notificações', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockResolvedValue(0 as any)
      const chain = makeFindChain([])
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      const result = await listarNotificacoesUseCase(makeInput())

      expect(result.data).toEqual([])
    })

    it('deve retornar naoLidas correto', async () => {
      vi.mocked(NotificacaoModel.countDocuments)
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(3)   // naoLidas

      const result = await listarNotificacoesUseCase(makeInput())

      expect(result.naoLidas).toBe(3)
    })

    it.each([
      { total: 25, limit: 10, expectedPages: 3 },
      { total: 11, limit: 10, expectedPages: 2 },
      { total: 10, limit: 10, expectedPages: 1 },
      { total: 0,  limit: 10, expectedPages: 0 },
    ])('total=$total limit=$limit → totalPages=$expectedPages', async ({ total, limit, expectedPages }) => {
      vi.mocked(NotificacaoModel.countDocuments)
        .mockResolvedValueOnce(total)  // total
        .mockResolvedValueOnce(0)      // naoLidas

      const result = await listarNotificacoesUseCase(makeInput({ limit }))

      expect(result.pagination.totalPages).toBe(expectedPages)
    })

    it.each([
      { page: 1, total: 25, limit: 10, hasNext: true,  hasPrev: false },
      { page: 3, total: 25, limit: 10, hasNext: false, hasPrev: true  },
      { page: 2, total: 25, limit: 10, hasNext: true,  hasPrev: true  },
      { page: 1, total: 0,  limit: 10, hasNext: false, hasPrev: false },
    ])('page=$page total=$total → hasNext=$hasNext hasPrev=$hasPrev', async ({ page, total, limit, hasNext, hasPrev }) => {
      vi.mocked(NotificacaoModel.countDocuments)
        .mockResolvedValueOnce(total)  // total
        .mockResolvedValueOnce(0)     // naoLidas

      const result = await listarNotificacoesUseCase(makeInput({ page, limit }))

      expect(result.pagination.hasNext).toBe(hasNext)
      expect(result.pagination.hasPrev).toBe(hasPrev)
    })

    it('deve retornar todos os campos de pagination', async () => {
      const result = await listarNotificacoesUseCase(makeInput())

      expect(result.pagination).toMatchObject({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
        hasNext: expect.any(Boolean),
        hasPrev: expect.any(Boolean),
      })
    })

    it('deve retornar notificações na ordem recebida (mais recente primeiro)', async () => {
      const notificacoes = [
        makeNotificacao({ _id: 'n2', criadoEm: DATA_FIXA_2 }),
        makeNotificacao({ _id: 'n1', criadoEm: DATA_FIXA_1 }),
      ]
      const chain = makeFindChain(notificacoes)
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      const result = await listarNotificacoesUseCase(makeInput())

      expect(result.data[0]._id).toBe('n2')
      expect(result.data[1]._id).toBe('n1')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com usuarioId, total e naoLidas', async () => {
      vi.mocked(NotificacaoModel.countDocuments)
        .mockResolvedValueOnce(15)  // total
        .mockResolvedValueOnce(3)   // naoLidas

      await listarNotificacoesUseCase(makeInput({ usuarioId: 'usuario-789' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-789', total: 15, naoLidas: 3 },
        '[NOTIFICACAO] Listagem realizada'
      )
    })

    it('deve chamar logger.info exatamente uma vez em caso de sucesso', async () => {
      await listarNotificacoesUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })

    it('não deve chamar logger.error em caso de sucesso', async () => {
      await listarNotificacoesUseCase(makeInput())

      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('tratamento de erros', () => {
    // Nos testes de erro usamos mockRejectedValue (sem Once) para garantir
    // que TODAS as chamadas ao countDocuments rejeitem dentro do Promise.all
    it('deve relançar NotificacaoError sem encapsular', async () => {
      const original = new NotificacaoError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(original as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error).toBe(original)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar NotificacaoError com code LIST_ERROR quando countDocuments falhar', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(new Error('db error') as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar NotificacaoError com code LIST_ERROR quando find falhar', async () => {
      const chain = makeFindChain()
      chain.lean.mockRejectedValue(new Error('db error'))
      vi.mocked(NotificacaoModel.find).mockReturnValue(chain as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar erro com statusCode 500', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(new Error('db error') as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error.statusCode).toBe(500)
    })

    it('deve lançar erro com mensagem correta', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(new Error('db error') as any)

      await expect(listarNotificacoesUseCase(makeInput())).rejects.toThrow('Erro ao listar notificações')
    })

    it('deve incluir originalError quando o erro é instância de Error', async () => {
      const dbError = new Error('db error')
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(dbError as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando o erro não é instância de Error', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue('string error' as any)

      const error = await listarNotificacoesUseCase(makeInput()).catch(e => e)

      expect(error.originalError).toBeUndefined()
    })

    it('deve logar o erro com usuarioId', async () => {
      const dbError = new Error('db error')
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(dbError as any)

      await listarNotificacoesUseCase(makeInput({ usuarioId: 'usuario-555' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-555' },
        '[NOTIFICACAO] Erro ao listar'
      )
    })

    it('deve chamar logger.error exatamente uma vez quando falhar', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(new Error('db error') as any)

      await listarNotificacoesUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })

    it('não deve chamar logger.info quando falhar', async () => {
      vi.mocked(NotificacaoModel.countDocuments).mockRejectedValue(new Error('db error') as any)

      await listarNotificacoesUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})