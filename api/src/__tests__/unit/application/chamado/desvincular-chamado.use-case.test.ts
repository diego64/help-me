import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NivelTecnico } from '@prisma/client'

import { desvincularChamadoUseCase } from '@application/use-cases/chamado/desvincular-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: { findUnique: vi.fn() },
    chamado: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const DATA_FIXA = new Date('2024-06-15T10:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof desvincularChamadoUseCase>[0] => ({
  paiId: 'chamado-pai-id',
  filhoId: 'chamado-filho-id',
  usuarioId: 'admin-id-123',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeFilho = (overrides = {}) => ({
  id: 'chamado-filho-id',
  OS: 'INC0000002',
  chamadoPaiId: 'chamado-pai-id',
  deletadoEm: null,
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  nivel: NivelTecnico.N2,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(DATA_FIXA)

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeFilho() as any)
  vi.mocked(prisma.chamado.update).mockResolvedValue(makeFilho() as any)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('desvincularChamadoUseCase', () => {
  describe('guard de permissão — TECNICO', () => {
    it('deve verificar nível do técnico quando usuarioRegra é TECNICO', async () => {
      await desvincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tec-id-123' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where:  { id: 'tec-id-123' },
        select: { nivel: true },
      })
    })

    it('não deve verificar nível quando usuarioRegra é ADMIN', async () => {
      await desvincularChamadoUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('não deve verificar nível quando usuarioRegra é USUARIO', async () => {
      await desvincularChamadoUseCase(makeInput({ usuarioRegra: 'USUARIO' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('deve lançar ChamadoError quando TECNICO N1 tenta desvincular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      await expect(
        desvincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN para TECNICO N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      const error = await desvincularChamadoUseCase(
        makeInput({ usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para TECNICO N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      const error = await desvincularChamadoUseCase(
        makeInput({ usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })

    it('deve lançar ChamadoError quando técnico não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(
        desvincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN quando técnico não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await desvincularChamadoUseCase(
        makeInput({ usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve permitir TECNICO N2 desvincular chamado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N2 } as any)

      await expect(
        desvincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO N3 desvincular chamado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N3 } as any)

      await expect(
        desvincularChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })
  })

  describe('verificação do chamado filho', () => {
    it('deve lançar ChamadoError quando filho não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(desvincularChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando filho não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando filho não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando filho está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(desvincularChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando filho está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('verificação do vínculo pai-filho', () => {
    it('deve lançar ChamadoError quando filho não pertence ao pai informado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ chamadoPaiId: 'outro-pai-id' }) as any
      )

      await expect(desvincularChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_CHILD quando vínculo não confere', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ chamadoPaiId: 'outro-pai-id' }) as any
      )

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_CHILD')
    })

    it('deve lançar ChamadoError com statusCode 400 quando vínculo não confere', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ chamadoPaiId: 'outro-pai-id' }) as any
      )

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve lançar ChamadoError com mensagem contendo OS do filho quando vínculo não confere', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeFilho({ OS: 'INC0000099', chamadoPaiId: 'outro-pai-id' }) as any
      )

      await expect(desvincularChamadoUseCase(makeInput())).rejects.toThrow('INC0000099')
    })
  })

  describe('atualização do chamado filho', () => {
    it('deve limpar chamadoPaiId, vinculadoEm e vinculadoPor no update', async () => {
      await desvincularChamadoUseCase(makeInput())

      expect(prisma.chamado.update).toHaveBeenCalledWith({
        where: { id: 'chamado-filho-id' },
        data: {
          chamadoPaiId: null,
          vinculadoEm:  null,
          vinculadoPor: null,
          atualizadoEm: DATA_FIXA,
        },
      })
    })

    it('deve gravar atualizadoEm com a data atual', async () => {
      await desvincularChamadoUseCase(makeInput())

      const { data } = vi.mocked(prisma.chamado.update).mock.calls[0][0] as any
      expect(data.atualizadoEm).toEqual(DATA_FIXA)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message com OS do filho', async () => {
      const result = await desvincularChamadoUseCase(makeInput())

      expect(result.message).toContain('INC0000002')
    })

    it('deve retornar message com texto de sucesso', async () => {
      const result = await desvincularChamadoUseCase(makeInput())

      expect(result.message).toBe('Chamado INC0000002 desvinculado com sucesso')
    })

    it('deve retornar filhoId', async () => {
      const result = await desvincularChamadoUseCase(makeInput())

      expect(result.filhoId).toBe('chamado-filho-id')
    })

    it('deve logar sucesso com paiId, filhoId e usuarioId', async () => {
      await desvincularChamadoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { paiId: 'chamado-pai-id', filhoId: 'chamado-filho-id', usuarioId: 'admin-id-123' },
        '[CHAMADO] Chamado desvinculado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code UNLINK_ERROR quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('UNLINK_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      await expect(desvincularChamadoUseCase(makeInput())).rejects.toThrow('Erro ao desvincular chamado')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      const error = await desvincularChamadoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com paiId e filhoId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      await desvincularChamadoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, paiId: 'chamado-pai-id', filhoId: 'chamado-filho-id' },
        '[CHAMADO] Erro ao desvincular'
      )
    })
  })
})