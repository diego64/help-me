import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client'

import { alterarPrioridadeUseCase } from '@application/use-cases/chamado/alterar-prioridade.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'
import { recalcularSLA } from '@domain/sla/sla.service'
import { publicarPrioridadeAlterada } from '@infrastructure/messaging/kafka/producers/notificacao.producer'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: { findUnique: vi.fn() },
    chamado: { findUnique: vi.fn(), update: vi.fn() },
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

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
}))

vi.mock('@domain/sla/sla.service', () => ({
  recalcularSLA: vi.fn(),
}))

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarPrioridadeAlterada: vi.fn(),
}))

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof alterarPrioridadeUseCase>[0] => ({
  id: 'chamado-id-123',
  prioridade: 'P2',
  motivo: 'Urgência identificada',
  usuarioId: 'admin-id-123',
  usuarioNome: 'Diego Admin',
  usuarioEmail: 'diego@email.com',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  prioridade: PrioridadeChamado.P4,
  status: ChamadoStatus.ABERTO,
  deletadoEm: null,
  tecnico: null,
  ...overrides,
})

const makeChamadoComTecnico = (overrides = {}) => ({
  ...makeChamado(),
  tecnico: {
    id: 'tecnico-id-123',
    nome: 'Carlos',
    sobrenome: 'Silva',
    email: 'carlos@email.com',
    nivel: NivelTecnico.N2,
  },
  ...overrides,
})

const makeChamadoAtualizado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  descricao: 'Problema com acesso',
  descricaoEncerramento: null,
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P2,
  prioridadeAlterada: DATA_FIXA,
  encerradoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  usuario: { id: 'usuario-id-123', nome: 'Usuario', sobrenome: 'Teste', email: 'u@email.com', setor: 'TI' },
  tecnico: null,
  alteradorPrioridade: { id: 'admin-id-123', nome: 'Diego', sobrenome: 'Admin', email: 'diego@email.com' },
  servicos: [],
  ...overrides,
})

const makeTecnicoUsuario = (overrides = {}) => ({
  nivel: NivelTecnico.N3,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.chamado.update).mockResolvedValue(makeChamadoAtualizado() as any)
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnicoUsuario() as any)
  vi.mocked(salvarHistoricoChamado).mockResolvedValue(undefined as any)
  vi.mocked(recalcularSLA).mockResolvedValue(undefined as any)
  vi.mocked(publicarPrioridadeAlterada).mockResolvedValue(undefined as any)
})

describe('alterarPrioridadeUseCase', () => {
  describe('validação da prioridade', () => {
    it('deve lançar ChamadoError para prioridade inválida', async () => {
      await expect(
        alterarPrioridadeUseCase(makeInput({ prioridade: 'P9' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code INVALID_PRIORITY', async () => {
      const error = await alterarPrioridadeUseCase(makeInput({ prioridade: 'INVALIDA' })).catch(e => e)
      expect(error.code).toBe('INVALID_PRIORITY')
    })

    it('deve lançar ChamadoError com statusCode 400 para prioridade inválida', async () => {
      const error = await alterarPrioridadeUseCase(makeInput({ prioridade: 'X1' })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve aceitar prioridade P1', async () => {
      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P1' }))).resolves.toBeDefined()
    })

    it('deve aceitar prioridade P2', async () => {
      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P2' }))).resolves.toBeDefined()
    })

    it('deve aceitar prioridade P3', async () => {
      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P3' }))).resolves.toBeDefined()
    })

    it('deve aceitar prioridade P4', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P1 }) as any
      )
      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P4' }))).resolves.toBeDefined()
    })

    it('deve aceitar prioridade P5', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P1 }) as any
      )
      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P5' }))).resolves.toBeDefined()
    })
  })

  describe('validação de permissão para TECNICO', () => {
    it('deve verificar nível do técnico quando autorRegra é TECNICO', async () => {
      await alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO', usuarioId: 'tecnico-id-123' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'tecnico-id-123' },
        select: { nivel: true },
      })
    })

    it('não deve verificar nível quando autorRegra é ADMIN', async () => {
      await alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('não deve verificar nível quando autorRegra é USUARIO', async () => {
      await alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'USUARIO' }))

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })

    it('deve lançar ChamadoError quando técnico não é N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      await expect(
        alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN para técnico não N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N2 } as any)

      const error = await alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para técnico sem permissão', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      const error = await alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve lançar ChamadoError quando técnico não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(
        alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve permitir técnico N3 alterar prioridade', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N3 } as any)

      await expect(
        alterarPrioridadeUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })
  })

  describe('verificação do chamado', () => {
    it('deve buscar chamado com select correto incluindo técnico', async () => {
      await alterarPrioridadeUseCase(makeInput())

      expect(prisma.chamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        select: {
          id: true,
          OS: true,
          prioridade: true,
          status: true,
          deletadoEm: true,
          tecnico: { select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } },
        },
      })
    })

    it('deve lançar ChamadoError quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })
  })

  describe('validação de status do chamado', () => {
    it('deve lançar ChamadoError para chamado CANCELADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(
        'Não é possível alterar a prioridade de um chamado cancelado'
      )
    })

    it('deve lançar ChamadoError para chamado ENCERRADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow(
        'Não é possível alterar a prioridade de um chamado encerrado'
      )
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para status bloqueante', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError quando prioridade já é a mesma', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P2 }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput({ prioridade: 'P2' }))).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code SAME_PRIORITY quando prioridade já é a mesma', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P2 }) as any
      )

      const error = await alterarPrioridadeUseCase(makeInput({ prioridade: 'P2' })).catch(e => e)
      expect(error.code).toBe('SAME_PRIORITY')
    })

    it('deve permitir alterar prioridade em chamado ABERTO', async () => {
      await expect(alterarPrioridadeUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir alterar prioridade em chamado EM_ATENDIMENTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.EM_ATENDIMENTO }) as any
      )

      await expect(alterarPrioridadeUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('atualização do chamado', () => {
    it('deve atualizar prioridade com prioridadeAlterada e prioridadeAlteradaPor', async () => {
      await alterarPrioridadeUseCase(makeInput())

      expect(prisma.chamado.update).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        data: {
          prioridade: PrioridadeChamado.P2,
          prioridadeAlterada: expect.any(Date),
          prioridadeAlteradaPor: 'admin-id-123',
        },
        include: expect.any(Object),
      })
    })
  })

  describe('side effects assíncronos', () => {
    it('deve salvar histórico com tipo PRIORIDADE', async () => {
      await alterarPrioridadeUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'PRIORIDADE',
          de: PrioridadeChamado.P4,
          para: 'P2',
          autorId: 'admin-id-123',
          autorNome: 'Diego Admin',
        })
      )
    })

    it('deve usar motivo fornecido no histórico', async () => {
      await alterarPrioridadeUseCase(makeInput({ motivo: 'Urgência identificada' }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Urgência identificada' })
      )
    })

    it('deve usar mensagem padrão no histórico quando motivo não fornecido', async () => {
      await alterarPrioridadeUseCase(makeInput({ motivo: undefined }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: expect.stringContaining('Prioridade alterada de'),
        })
      )
    })

    it('deve recalcular SLA com a nova prioridade', async () => {
      await alterarPrioridadeUseCase(makeInput())

      expect(recalcularSLA).toHaveBeenCalledWith('chamado-id-123', PrioridadeChamado.P2)
    })

    it('deve publicar evento quando chamado tem técnico', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamadoComTecnico() as any)

      await alterarPrioridadeUseCase(makeInput())

      expect(publicarPrioridadeAlterada).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: 'chamado-id-123',
          prioridadeAnterior: PrioridadeChamado.P4,
          prioridadeNova: 'P2',
          alteradoPorNome: 'Diego Admin',
        })
      )
    })

    it('não deve publicar evento quando chamado não tem técnico', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado({ tecnico: null }) as any)

      await alterarPrioridadeUseCase(makeInput())

      expect(publicarPrioridadeAlterada).not.toHaveBeenCalled()
    })

    it('deve formatar nome do técnico como nome + sobrenome no evento', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamadoComTecnico() as any)

      await alterarPrioridadeUseCase(makeInput())

      expect(publicarPrioridadeAlterada).toHaveBeenCalledWith(
        expect.objectContaining({
          tecnico: expect.objectContaining({ nome: 'Carlos Silva' }),
        })
      )
    })

    it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

      await expect(alterarPrioridadeUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve continuar mesmo se recalcularSLA falhar', async () => {
      vi.mocked(recalcularSLA).mockRejectedValue(new Error('SLA error'))

      await expect(alterarPrioridadeUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve continuar mesmo se publicarPrioridadeAlterada falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamadoComTecnico() as any)
      vi.mocked(publicarPrioridadeAlterada).mockRejectedValue(new Error('Kafka error'))

      await expect(alterarPrioridadeUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message com OS e nova prioridade', async () => {
      const result = await alterarPrioridadeUseCase(makeInput())

      expect(result.message).toContain('INC0001')
      expect(result.message).toContain('P2')
    })

    it('deve retornar chamado formatado', async () => {
      const result = await alterarPrioridadeUseCase(makeInput())

      expect(result).toHaveProperty('chamado')
      expect(result.chamado).toHaveProperty('id')
      expect(result.chamado).toHaveProperty('OS')
      expect(result.chamado).toHaveProperty('prioridade')
    })

    it('deve logar sucesso com chamadoId, prioridade e usuarioId', async () => {
      await alterarPrioridadeUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', prioridade: 'P2', usuarioId: 'admin-id-123' },
        '[CHAMADO] Prioridade alterada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code PRIORITY_ERROR quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('PRIORITY_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.chamado.update).mockRejectedValue(new Error('Database error'))

      await expect(alterarPrioridadeUseCase(makeInput())).rejects.toThrow('Erro ao alterar prioridade do chamado')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      const error = await alterarPrioridadeUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com chamadoId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.update).mockRejectedValue(dbError)

      await alterarPrioridadeUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao alterar prioridade'
      )
    })
  })
})