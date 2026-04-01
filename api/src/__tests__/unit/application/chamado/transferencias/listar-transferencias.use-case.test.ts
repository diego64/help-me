import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarTransferenciasUseCase } from '@application/use-cases/chamado/transferencias/listar-transferencias.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    transferenciaChamado: {
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

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  deletadoEm: null,
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nome: 'Carlos',
  sobrenome: 'Silva',
  email: 'carlos@email.com',
  nivel: 'N2',
  ...overrides,
})

const makeTransferidor = (overrides = {}) => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Admin',
  email: 'diego@email.com',
  regra: 'ADMIN',
  ...overrides,
})

const makeTransferencia = (overrides = {}) => ({
  id: 'transferencia-id-123',
  motivo: 'Técnico sem disponibilidade',
  transferidoEm: DATA_FIXA,
  tecnicoAnterior: makeTecnico({ id: 'tecnico-anterior-id', nome: 'Paulo', sobrenome: 'Antigo' }),
  tecnicoNovo: makeTecnico({ id: 'tecnico-novo-id', nome: 'Carlos', sobrenome: 'Novo' }),
  transferidor: makeTransferidor(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([makeTransferencia()] as any)
})

describe('listarTransferenciasUseCase', () => {
  describe('verificação do chamado', () => {
    it('deve buscar chamado pelo id com select correto', async () => {
      await listarTransferenciasUseCase('chamado-id-123')

      expect(prisma.chamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        select: { id: true, OS: true, deletadoEm: true },
      })
    })

    it('deve lançar ChamadoError quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarTransferenciasUseCase('chamado-id-123')).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarTransferenciasUseCase('chamado-id-123')).rejects.toThrow('Chamado não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(listarTransferenciasUseCase('chamado-id-123')).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para chamado deletado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('busca de transferências', () => {
    it('deve buscar transferências filtrando por chamadoId', async () => {
      await listarTransferenciasUseCase('chamado-id-123')

      expect(prisma.transferenciaChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chamadoId: 'chamado-id-123' },
        })
      )
    })

    it('deve ordenar por transferidoEm desc', async () => {
      await listarTransferenciasUseCase('chamado-id-123')

      expect(prisma.transferenciaChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { transferidoEm: 'desc' },
        })
      )
    })

    it('deve selecionar campos corretos incluindo técnicos e transferidor', async () => {
      await listarTransferenciasUseCase('chamado-id-123')

      expect(prisma.transferenciaChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            motivo: true,
            transferidoEm: true,
            tecnicoAnterior: { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
            tecnicoNovo: { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
            transferidor: { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
          },
        })
      )
    })
  })

  describe('retorno', () => {
    it('deve retornar chamadoOS corretamente', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.chamadoOS).toBe('INC0001')
    })

    it('deve retornar total de transferências', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([
        makeTransferencia(),
        makeTransferencia({ id: 'transferencia-id-456' }),
      ] as any)

      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.total).toBe(2)
    })

    it('deve retornar total 0 quando não há transferências', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([])

      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.total).toBe(0)
    })

    it('deve retornar lista vazia quando não há transferências', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([])

      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias).toEqual([])
    })

    it('deve retornar campos da transferência corretamente', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]).toMatchObject({
        id: 'transferencia-id-123',
        motivo: 'Técnico sem disponibilidade',
        transferidoEm: DATA_FIXA,
      })
    })

    it('deve formatar nome do tecnicoNovo como nome + sobrenome', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.tecnicoNovo.nome).toBe('Carlos Novo')
    })

    it('deve retornar id, email e nivel do tecnicoNovo', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.tecnicoNovo.id).toBe('tecnico-novo-id')
      expect(result.transferencias[0]?.tecnicoNovo.email).toBe('carlos@email.com')
      expect(result.transferencias[0]?.tecnicoNovo.nivel).toBe('N2')
    })

    it('deve formatar nome do tecnicoAnterior como nome + sobrenome', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.tecnicoAnterior?.nome).toBe('Paulo Antigo')
    })

    it('deve retornar tecnicoAnterior como null quando ausente', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([
        makeTransferencia({ tecnicoAnterior: null }) as any,
      ] as any)

      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.tecnicoAnterior).toBeNull()
    })

    it('deve formatar nome do transferidor como nome + sobrenome', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.transferidoPor.nome).toBe('Diego Admin')
    })

    it('deve retornar id, email e regra do transferidor', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.transferidoPor.id).toBe('admin-id-123')
      expect(result.transferencias[0]?.transferidoPor.email).toBe('diego@email.com')
      expect(result.transferencias[0]?.transferidoPor.regra).toBe('ADMIN')
    })

    it('não deve expor sobrenome separado em tecnicoNovo', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.tecnicoNovo).not.toHaveProperty('sobrenome')
    })

    it('não deve expor sobrenome separado em transferidoPor', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias[0]?.transferidoPor).not.toHaveProperty('sobrenome')
    })

    it('deve mapear múltiplas transferências corretamente', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([
        makeTransferencia({ id: 't-1', motivo: 'Motivo 1' }),
        makeTransferencia({ id: 't-2', motivo: 'Motivo 2' }),
      ] as any)

      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result.transferencias).toHaveLength(2)
      expect(result.transferencias[0]?.id).toBe('t-1')
      expect(result.transferencias[1]?.id).toBe('t-2')
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await listarTransferenciasUseCase('chamado-id-123')

      expect(result).toHaveProperty('chamadoOS')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('transferencias')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId e total', async () => {
      await listarTransferenciasUseCase('chamado-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 1 },
        '[CHAMADO] Transferências listadas'
      )
    })

    it('deve logar total 0 quando sem transferências', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockResolvedValue([])

      await listarTransferenciasUseCase('chamado-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 0 },
        '[CHAMADO] Transferências listadas'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code TRANSFERENCIAS_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('TRANSFERENCIAS_ERROR')
    })

    it('deve lançar ChamadoError com code TRANSFERENCIAS_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.transferenciaChamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('TRANSFERENCIAS_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(listarTransferenciasUseCase('chamado-id-123')).rejects.toThrow('Erro ao buscar transferências')
    })

    it('deve incluir originalError quando falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue('string error')

      const error = await listarTransferenciasUseCase('chamado-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      await listarTransferenciasUseCase('chamado-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao listar transferências'
      )
    })
  })
})