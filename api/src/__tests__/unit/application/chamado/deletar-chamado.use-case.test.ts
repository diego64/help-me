import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { deletarChamadoUseCase } from '@application/use-cases/chamado/deletar-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: { findUnique: vi.fn(), update: vi.fn() },
    ordemDeServico: { deleteMany: vi.fn() },
    $transaction:   vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const DATA_FIXA = new Date('2024-06-15T10:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof deletarChamadoUseCase>[0] => ({
  id: 'chamado-id-123',
  permanente: false,
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  status: ChamadoStatus.ABERTO,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(DATA_FIXA)

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.chamado.update).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({
      ordemDeServico: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      chamado: { delete: vi.fn().mockResolvedValue(makeChamado()) },
    })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('deletarChamadoUseCase', () => {
  describe('verificação do chamado', () => {
    it('deve lançar ChamadoError quando chamado não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(deletarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('soft delete (permanente: false)', () => {
    it('deve chamar chamado.update com deletadoEm preenchido', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(prisma.chamado.update).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        data:  { deletadoEm: DATA_FIXA },
      })
    })

    it('não deve usar $transaction no soft delete', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('deve retornar message com OS do chamado', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(result.message).toContain('INC0001')
    })

    it('deve retornar message com texto de sucesso', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(result.message).toBe('Chamado INC0001 excluído com sucesso')
    })

    it('deve retornar o id do chamado', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(result.id).toBe('chamado-id-123')
    })

    it('deve logar soft delete com chamadoId e OS', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: false }))

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', OS: 'INC0001' },
        '[CHAMADO] Soft delete realizado'
      )
    })
  })

  describe('delete permanente (permanente: true)', () => {
    it('deve usar $transaction no delete permanente', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(prisma.$transaction).toHaveBeenCalledOnce()
    })

    it('deve deletar ordens de serviço vinculadas antes do chamado', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 0 })
      const deleteChamado = vi.fn().mockResolvedValue(makeChamado())

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({ ordemDeServico: { deleteMany }, chamado: { delete: deleteChamado } })
      )

      await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(deleteMany).toHaveBeenCalledWith({ where: { chamadoId: 'chamado-id-123' } })
      expect(deleteChamado).toHaveBeenCalledWith({ where: { id: 'chamado-id-123' } })
    })

    it('deve deletar ordens de serviço antes do chamado (ordem de execução)', async () => {
      const ordem: string[] = []
      const deleteMany    = vi.fn().mockImplementation(() => { ordem.push('deleteMany'); return Promise.resolve({ count: 0 }) })
      const deleteChamado = vi.fn().mockImplementation(() => { ordem.push('delete');     return Promise.resolve(makeChamado()) })

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({ ordemDeServico: { deleteMany }, chamado: { delete: deleteChamado } })
      )

      await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(ordem).toEqual(['deleteMany', 'delete'])
    })

    it('não deve chamar chamado.update no delete permanente', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(prisma.chamado.update).not.toHaveBeenCalled()
    })

    it('deve retornar message com OS do chamado', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(result.message).toContain('INC0001')
    })

    it('deve retornar message com texto de exclusão permanente', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(result.message).toBe('Chamado INC0001 excluído permanentemente')
    })

    it('deve retornar o id do chamado', async () => {
      const result = await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(result.id).toBe('chamado-id-123')
    })

    it('deve logar exclusão permanente com chamadoId e OS', async () => {
      await deletarChamadoUseCase(makeInput({ permanente: true }))

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', OS: 'INC0001' },
        '[CHAMADO] Excluído permanentemente'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarChamadoUseCase(makeInput())).rejects.toThrow('Erro ao deletar o chamado')
    })

    it('deve lançar ChamadoError com code DELETE_ERROR quando $transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('TX error'))

      const error = await deletarChamadoUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      const error = await deletarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com chamadoId quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      await deletarChamadoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao deletar'
      )
    })
  })
})