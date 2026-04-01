import { describe, it, expect, vi, beforeEach } from 'vitest'

import { deletarNotificacaoUseCase } from '@application/use-cases/notificacao/deletar-notificacao.use-case'
import { NotificacaoError } from '@application/use-cases/notificacao/errors'
import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: {
    findOneAndDelete: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof deletarNotificacaoUseCase>[0] => ({
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
  lida: false,
  lidaEm: null,
  criadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(makeNotificacao() as any)
})

describe('deletarNotificacaoUseCase', () => {
  describe('busca da notificação', () => {
    it('deve buscar notificação por _id e destinatarioId', async () => {
      await deletarNotificacaoUseCase(makeInput())

      expect(NotificacaoModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'notif-id-123',
        destinatarioId: 'usuario-id-456',
      })
    })

    it('deve buscar com notificacaoId fornecido', async () => {
      await deletarNotificacaoUseCase(makeInput({ notificacaoId: 'outro-id-789' }))

      expect(NotificacaoModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'outro-id-789',
        destinatarioId: 'usuario-id-456',
      })
    })

    it('deve buscar com usuarioId fornecido', async () => {
      await deletarNotificacaoUseCase(makeInput({ usuarioId: 'usuario-789' }))

      expect(NotificacaoModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'notif-id-123',
        destinatarioId: 'usuario-789',
      })
    })

    it('deve chamar findOneAndDelete uma vez', async () => {
      await deletarNotificacaoUseCase(makeInput())

      expect(NotificacaoModel.findOneAndDelete).toHaveBeenCalledTimes(1)
    })
  })

  describe('cenário de sucesso', () => {
    it('deve retornar mensagem de sucesso', async () => {
      const result = await deletarNotificacaoUseCase(makeInput())

      expect(result.message).toBe('Notificação removida')
    })

    it('deve retornar id da notificação deletada', async () => {
      const result = await deletarNotificacaoUseCase(makeInput({ notificacaoId: 'notif-999' }))

      expect(result.id).toBe('notif-999')
    })

    it('deve retornar objeto com message e id', async () => {
      const result = await deletarNotificacaoUseCase(makeInput())

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('id')
    })

    it('deve logar sucesso com notificacaoId e usuarioId', async () => {
      await deletarNotificacaoUseCase(makeInput({ notificacaoId: 'notif-555', usuarioId: 'user-888' }))

      expect(logger.info).toHaveBeenCalledWith(
        { notificacaoId: 'notif-555', usuarioId: 'user-888' },
        '[NOTIFICACAO] Removida'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await deletarNotificacaoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('notificação não encontrada', () => {
    it('deve lançar NotificacaoError quando notificação não existe', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      await expect(deletarNotificacaoUseCase(makeInput())).rejects.toThrow(NotificacaoError)
    })

    it('deve lançar erro com code NOT_FOUND', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar erro com statusCode 404', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar erro com mensagem "Notificação não encontrada"', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      await expect(deletarNotificacaoUseCase(makeInput())).rejects.toThrow('Notificação não encontrada')
    })

    it('não deve logar sucesso quando notificação não encontrada', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      await deletarNotificacaoUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar NotificacaoError sem encapsular', async () => {
      const notifError = new NotificacaoError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(notifError)

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)

      expect(error).toBe(notifError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar NotificacaoError com code DELETE_ERROR quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(new Error('Database error'))

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar erro com statusCode 500 quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(new Error('Database error'))

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar erro com mensagem "Erro ao remover notificação"', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(new Error('Database error'))

      await expect(deletarNotificacaoUseCase(makeInput())).rejects.toThrow('Erro ao remover notificação')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(dbError)

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue('string error')

      const error = await deletarNotificacaoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(dbError)

      await deletarNotificacaoUseCase(makeInput({ notificacaoId: 'notif-555' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, notificacaoId: 'notif-555' },
        '[NOTIFICACAO] Erro ao deletar'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(new Error('Database error'))

      await deletarNotificacaoUseCase(makeInput()).catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockRejectedValue(new Error('Database error'))

      await deletarNotificacaoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('isolamento de usuários', () => {
    it('deve garantir que usuário só pode deletar suas próprias notificações', async () => {
      await deletarNotificacaoUseCase(makeInput({ usuarioId: 'usuario-123', notificacaoId: 'notif-456' }))

      expect(NotificacaoModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'notif-456',
        destinatarioId: 'usuario-123',
      })
    })

    it('deve falhar se notificação pertence a outro usuário', async () => {
      vi.mocked(NotificacaoModel.findOneAndDelete).mockResolvedValue(null)

      await expect(
        deletarNotificacaoUseCase(makeInput({ usuarioId: 'outro-usuario', notificacaoId: 'notif-de-outro' }))
      ).rejects.toThrow('Notificação não encontrada')
    })
  })
})
