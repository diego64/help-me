import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { atualizarHorariosUseCase } from '@application/use-cases/tecnico/atualizar-horarios.use-case'
import { TecnicoError } from '@application/use-cases/tecnico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

const mockExpedienteUpdateMany = vi.fn()
const mockExpedienteCreate = vi.fn()

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof atualizarHorariosUseCase>[0] => ({
  id: 'tecnico-id-123',
  entrada: '08:00',
  saida: '17:00',
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  regra: 'TECNICO' as Regra,
  ...overrides,
})

const makeHorario = (overrides = {}) => ({
  id: 'horario-id-123',
  entrada: new Date('2024-01-01T08:00:00.000Z'),
  saida: new Date('2024-01-01T17:00:00.000Z'),
  ativo: true,
  geradoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  mockExpedienteUpdateMany.mockResolvedValue({ count: 1 })
  mockExpedienteCreate.mockResolvedValue(makeHorario())

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: any) => fn({
    expediente: {
      updateMany: mockExpedienteUpdateMany,
      create: mockExpedienteCreate,
    },
  })) as any)
})

describe('atualizarHorariosUseCase', () => {
  describe('verificação de existência do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await atualizarHorariosUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarHorariosUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarHorariosUseCase(makeInput())).rejects.toThrow('Técnico não encontrado')
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(atualizarHorariosUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })
  })

  describe('atualização dos horários via transaction', () => {
    it('deve executar dentro de uma transaction', async () => {
      await atualizarHorariosUseCase(makeInput())

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('deve desativar expedientes anteriores dentro da transaction', async () => {
      await atualizarHorariosUseCase(makeInput())

      expect(mockExpedienteUpdateMany).toHaveBeenCalledWith({
        where: { usuarioId: 'tecnico-id-123' },
        data: { deletadoEm: expect.any(Date), ativo: false },
      })
    })

    it('deve criar novo expediente com entrada e saida corretos', async () => {
      await atualizarHorariosUseCase(makeInput({ entrada: '09:00', saida: '18:00' }))

      expect(mockExpedienteCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usuarioId: 'tecnico-id-123',
            entrada: expect.any(Date),
            saida: expect.any(Date),
          }),
        })
      )
    })

    it('deve retornar mensagem e horário criado', async () => {
      const horario = makeHorario()
      mockExpedienteCreate.mockResolvedValue(horario)

      const result = await atualizarHorariosUseCase(makeInput())

      expect(result).toEqual({
        message: 'Horário de disponibilidade atualizado com sucesso',
        horario,
      })
    })

    it('deve logar sucesso após atualizar horários', async () => {
      await atualizarHorariosUseCase(makeInput({ entrada: '08:00', saida: '17:00' }))

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-123', entrada: '08:00', saida: '17:00' },
        '[TECNICO] Horários atualizados'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code HORARIOS_ERROR quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction error'))

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('HORARIOS_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction error'))

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction error'))

      await expect(atualizarHorariosUseCase(makeInput())).rejects.toThrow('Erro ao atualizar horários')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Transaction error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      const error = await atualizarHorariosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando transaction falhar', async () => {
      const dbError = new Error('Transaction error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      await atualizarHorariosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao atualizar horários'
      )
    })
  })
})
