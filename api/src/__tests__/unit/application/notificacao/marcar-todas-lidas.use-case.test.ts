import { describe, it, expect, vi, beforeEach } from 'vitest'

import { marcarTodasLidasUseCase } from '@application/use-cases/notificacao/marcar-todas-lidas.use-case'
import { NotificacaoError } from '@application/use-cases/notificacao/errors'
import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: {
    updateMany: vi.fn(),
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

const makeUpdateResult = (modifiedCount: number = 5) => ({
  acknowledged: true,
  matchedCount: modifiedCount,
  modifiedCount,
  upsertedCount: 0,
  upsertedId: null,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult() as any)
})

describe('marcarTodasLidasUseCase', () => {
  describe('filtro de atualização', () => {
    it('deve atualizar notificações do usuário especificado', async () => {
      await marcarTodasLidasUseCase('usuario-id-123')

      expect(NotificacaoModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'usuario-id-123' }),
        expect.anything()
      )
    })

    it('deve atualizar apenas notificações não lidas', async () => {
      await marcarTodasLidasUseCase('usuario-id-456')

      expect(NotificacaoModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ lida: false }),
        expect.anything()
      )
    })

    it('deve combinar destinatarioId e lida=false no filtro', async () => {
      await marcarTodasLidasUseCase('usuario-id-789')

      expect(NotificacaoModel.updateMany).toHaveBeenCalledWith(
        { destinatarioId: 'usuario-id-789', lida: false },
        expect.anything()
      )
    })
  })

  describe('dados de atualização', () => {
    it('deve atualizar lida para true', async () => {
      await marcarTodasLidasUseCase('usuario-id-123')

      expect(NotificacaoModel.updateMany).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lida: true })
      )
    })

    it('deve definir lidaEm com data atual', async () => {
      const antes = new Date()
      await marcarTodasLidasUseCase('usuario-id-123')
      const depois = new Date()

      const [, updateData] = vi.mocked(NotificacaoModel.updateMany).mock.calls[0] ?? []
      const lidaEm = updateData?.lidaEm

      expect(lidaEm).toBeInstanceOf(Date)
      expect(lidaEm?.getTime()).toBeGreaterThanOrEqual(antes.getTime())
      expect(lidaEm?.getTime()).toBeLessThanOrEqual(depois.getTime())
    })

    it('deve passar objeto com lida e lidaEm', async () => {
      await marcarTodasLidasUseCase('usuario-id-123')

      const [, updateData] = vi.mocked(NotificacaoModel.updateMany).mock.calls[0] ?? []

      expect(updateData).toHaveProperty('lida')
      expect(updateData).toHaveProperty('lidaEm')
    })
  })

  describe('cenário de sucesso', () => {
    it('deve retornar mensagem de sucesso', async () => {
      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result.message).toBe('Todas as notificações marcadas como lidas')
    })

    it('deve retornar quantidade de notificações atualizadas', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(10) as any)

      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result.atualizadas).toBe(10)
    })

    it('deve retornar 0 quando não há notificações não lidas', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(0) as any)

      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result.atualizadas).toBe(0)
    })

    it('deve retornar objeto com message e atualizadas', async () => {
      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('atualizadas')
    })

    it('deve chamar updateMany uma vez', async () => {
      await marcarTodasLidasUseCase('usuario-id-123')

      expect(NotificacaoModel.updateMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com usuarioId e quantidade atualizada', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(7) as any)

      await marcarTodasLidasUseCase('usuario-id-789')

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-789', atualizadas: 7 },
        '[NOTIFICACAO] Todas marcadas como lidas'
      )
    })

    it('deve logar com atualizadas=0 quando não há notificações não lidas', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(0) as any)

      await marcarTodasLidasUseCase('usuario-id-555')

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-555', atualizadas: 0 },
        '[NOTIFICACAO] Todas marcadas como lidas'
      )
    })

    it('deve chamar logger.info uma vez em caso de sucesso', async () => {
      await marcarTodasLidasUseCase('usuario-id-123')

      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar NotificacaoError sem encapsular', async () => {
      const notifError = new NotificacaoError('Erro customizado', 'CUSTOM_ERROR', 400)
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(notifError)

      const error = await marcarTodasLidasUseCase('usuario-id-123').catch(e => e)

      expect(error).toBe(notifError)
      expect(error.code).toBe('CUSTOM_ERROR')
    })

    it('deve lançar NotificacaoError com code MARK_ALL_READ_ERROR quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(new Error('Database error'))

      const error = await marcarTodasLidasUseCase('usuario-id-123').catch(e => e)

      expect(error).toBeInstanceOf(NotificacaoError)
      expect(error.code).toBe('MARK_ALL_READ_ERROR')
    })

    it('deve lançar erro com statusCode 500 quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(new Error('Database error'))

      const error = await marcarTodasLidasUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar erro com mensagem "Erro ao marcar notificações como lidas"', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(new Error('Database error'))

      await expect(marcarTodasLidasUseCase('usuario-id-123')).rejects.toThrow(
        'Erro ao marcar notificações como lidas'
      )
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(dbError)

      const error = await marcarTodasLidasUseCase('usuario-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue('string error')

      const error = await marcarTodasLidasUseCase('usuario-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(dbError)

      await marcarTodasLidasUseCase('usuario-id-555').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-555' },
        '[NOTIFICACAO] Erro ao marcar todas como lidas'
      )
    })

    it('não deve chamar logger.info quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(new Error('Database error'))

      await marcarTodasLidasUseCase('usuario-id-123').catch(() => {})

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('deve chamar logger.error uma vez quando operação falhar', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockRejectedValue(new Error('Database error'))

      await marcarTodasLidasUseCase('usuario-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('isolamento de usuários', () => {
    it('deve atualizar apenas notificações do usuário especificado', async () => {
      await marcarTodasLidasUseCase('usuario-especifico-999')

      const [filter] = vi.mocked(NotificacaoModel.updateMany).mock.calls[0] ?? []
      expect(filter).toEqual({ destinatarioId: 'usuario-especifico-999', lida: false })
    })

    it('não deve afetar notificações de outros usuários', async () => {
      await marcarTodasLidasUseCase('usuario-A')

      const [filter] = vi.mocked(NotificacaoModel.updateMany).mock.calls[0] ?? []
      expect(filter?.destinatarioId).toBe('usuario-A')
    })
  })

  describe('cenários especiais', () => {
    it('deve funcionar quando modifiedCount é grande', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(1000) as any)

      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result.atualizadas).toBe(1000)
    })

    it('deve funcionar quando modifiedCount é 1', async () => {
      vi.mocked(NotificacaoModel.updateMany).mockResolvedValue(makeUpdateResult(1) as any)

      const result = await marcarTodasLidasUseCase('usuario-id-123')

      expect(result.atualizadas).toBe(1)
    })
  })
})
