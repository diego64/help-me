import { describe, it, expect, vi, beforeEach } from 'vitest'

import { marcarLidaUseCase } from '@application/use-cases/notificacao/marcar-lida.use-case'
import { NotificacaoError } from '@application/use-cases/notificacao/errors'
import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof marcarLidaUseCase>[0] => ({
  notificacaoId: 'notif-id-123',
  usuarioId: 'usuario-id-456',
  ...overrides,
})

const makeNotificacao = (overrides = {}) => ({
  _id: 'notif-id-123',
  titulo: 'Novo chamado atribuído',
  mensagem: 'Você recebeu um novo chamado',
  tipo: 'ATRIBUICAO',
  destinatarioId: 'usuario-id-456',
  lida: true,
  lidaEm: DATA_FIXA,
  criadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(makeNotificacao() as any)
})

describe('marcarLidaUseCase', () => {
  describe('filtro de busca', () => {
    it('deve buscar notificação por _id e destinatarioId', async () => {
      await marcarLidaUseCase(makeInput())

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'notif-id-123', destinatarioId: 'usuario-id-456' },
        expect.anything(),
        expect.anything()
      )
    })

    it('deve buscar com notificacaoId fornecido', async () => {
      await marcarLidaUseCase(makeInput({ notificacaoId: 'outro-id-789' }))

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'outro-id-789' }),
        expect.anything(),
        expect.anything()
      )
    })

    it('deve buscar com usuarioId fornecido', async () => {
      await marcarLidaUseCase(makeInput({ usuarioId: 'usuario-789' }))

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'usuario-789' }),
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('dados de atualização', () => {
    it('deve atualizar lida para true', async () => {
      await marcarLidaUseCase(makeInput())

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lida: true }),
        expect.anything()
      )
    })

    it('deve definir lidaEm com data atual', async () => {
      const antes = new Date()
      await marcarLidaUseCase(makeInput())
      const depois = new Date()

      const [, updateData] = vi.mocked(NotificacaoModel.findOneAndUpdate).mock.calls[0] ?? []
      const lidaEm = updateData?.lidaEm

      expect(lidaEm).toBeInstanceOf(Date)
      expect(lidaEm?.getTime()).toBeGreaterThanOrEqual(antes.getTime())
      expect(lidaEm?.getTime()).toBeLessThanOrEqual(depois.getTime())
    })

    it('deve passar objeto com lida e lidaEm', async () => {
      await marcarLidaUseCase(makeInput())

      const [, updateData] = vi.mocked(NotificacaoModel.findOneAndUpdate).mock.calls[0] ?? []

      expect(updateData).toHaveProperty('lida')
      expect(updateData).toHaveProperty('lidaEm')
    })
  })

  describe('opções do findOneAndUpdate', () => {
    it('deve usar opção new: true para retornar documento atualizado', async () => {
      await marcarLidaUseCase(makeInput())

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { new: true }
      )
    })

    it('deve chamar findOneAndUpdate uma vez', async () => {
      await marcarLidaUseCase(makeInput())

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledTimes(1)
    })
  })

  describe('cenário de sucesso', () => {
    it('deve retornar mensagem de sucesso', async () => {
      const result = await marcarLidaUseCase(makeInput())

      expect(result.message).toBe('Notificação marcada como lida')
    })

    it('deve retornar notificação atualizada', async () => {
      const notifAtualizada = makeNotificacao({ _id: 'notif-999', lida: true })
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(notifAtualizada as any)

      const result = await marcarLidaUseCase(makeInput())

      expect(result.notificacao).toEqual(notifAtualizada)
    })

    it('deve retornar objeto com message e notificacao', async () => {
      const result = await marcarLidaUseCase(makeInput())

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('notificacao')
    })

    it('deve retornar notificacao com lida=true', async () => {
      const result = await marcarLidaUseCase(makeInput())

      expect(result.notificacao.lida).toBe(true)
    })

    it('deve retornar notificacao com lidaEm definido', async () => {
      const result = await marcarLidaUseCase(makeInput())

      expect(result.notificacao.lidaEm).toBeDefined()
      expect(result.notificacao.lidaEm).toBeInstanceOf(Date)
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com notificacaoId e usuarioId', async () => {
      await marcarLidaUseCase(makeInput({ notificacaoId: 'notif-555', usuarioId: 'user-888' }))

      expect(logger.info).toHaveBeenCalledWith(
        { notificacaoId: 'notif-555', usuarioId: 'user-888' },
        '[NOTIFICACAO] Marcada como lida'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await marcarLidaUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('notificação não encontrada', () => {
    it('deve lançar NotificacaoError quando notificação não existe', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      await expect(marcarLidaUseCase(makeInput())).rejects.toThrow(NotificacaoError)
    })

    it('deve lançar erro com code NOT_FOUND', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar erro com statusCode 404', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar erro com mensagem "Notificação não encontrada"', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      await expect(marcarLidaUseCase(makeInput())).rejects.toThrow('Notificação não encontrada')
    })

    it('não deve logar sucesso quando notificação não encontrada', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      await marcarLidaUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar NotificacaoError sem encapsular', async () => {
      const notifError = new NotificacaoError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(notifError)

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)

      expect(error).toBe(notifError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar NotificacaoError com code MARK_READ_ERROR quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(new Error('Database error'))

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('MARK_READ_ERROR')
    })

    it('deve lançar erro com statusCode 500 quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(new Error('Database error'))

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar erro com mensagem "Erro ao marcar notificação como lida"', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(new Error('Database error'))

      await expect(marcarLidaUseCase(makeInput())).rejects.toThrow(
        'Erro ao marcar notificação como lida'
      )
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(dbError)

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue('string error')

      const error = await marcarLidaUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(dbError)

      await marcarLidaUseCase(makeInput({ notificacaoId: 'notif-555' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, notificacaoId: 'notif-555' },
        '[NOTIFICACAO] Erro ao marcar como lida'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(new Error('Database error'))

      await marcarLidaUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockRejectedValue(new Error('Database error'))

      await marcarLidaUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('isolamento de usuários', () => {
    it('deve garantir que usuário só pode marcar suas próprias notificações', async () => {
      await marcarLidaUseCase(makeInput({ usuarioId: 'usuario-123', notificacaoId: 'notif-456' }))

      expect(NotificacaoModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'notif-456', destinatarioId: 'usuario-123' },
        expect.anything(),
        expect.anything()
      )
    })

    it('deve falhar se notificação pertence a outro usuário', async () => {
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(null)

      await expect(
        marcarLidaUseCase(makeInput({ usuarioId: 'outro-usuario', notificacaoId: 'notif-de-outro' }))
      ).rejects.toThrow('Notificação não encontrada')
    })
  })

  describe('cenários de notificações já lidas', () => {
    it('deve permitir marcar como lida uma notificação já lida', async () => {
      const notifJaLida = makeNotificacao({ lida: true, lidaEm: DATA_FIXA })
      vi.mocked(NotificacaoModel.findOneAndUpdate).mockResolvedValue(notifJaLida as any)

      await expect(marcarLidaUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve atualizar lidaEm mesmo que notificação já esteja lida', async () => {
      await marcarLidaUseCase(makeInput())

      const [, updateData] = vi.mocked(NotificacaoModel.findOneAndUpdate).mock.calls[0] ?? []
      expect(updateData?.lidaEm).toBeInstanceOf(Date)
    })
  })
})
