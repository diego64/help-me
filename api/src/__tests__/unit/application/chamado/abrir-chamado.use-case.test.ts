import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { abrirChamadoUseCase } from '@application/use-cases/chamado/abrir-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'
import { calcularEPersistirSLA } from '@domain/sla/sla.service'
import { publicarChamadoAberto } from '@infrastructure/messaging/kafka/producers/notificacao.producer'
import { uploadArquivos } from '@application/use-cases/chamado/helpers/upload-arquivos.helper'
import { gerarNumeroOS } from '@application/use-cases/chamado/helpers/os.helper'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
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

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
}))

vi.mock('@domain/sla/sla.service', () => ({
  calcularEPersistirSLA: vi.fn(),
}))

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarChamadoAberto: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/helpers/upload-arquivos.helper', () => ({
  uploadArquivos: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/helpers/os.helper', () => ({
  gerarNumeroOS: vi.fn(),
}))

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof abrirChamadoUseCase>[0] => ({
  descricao: 'Problema com acesso ao sistema',
  servico: 'Suporte TI',
  arquivos: [],
  usuarioId: 'usuario-id-123',
  usuarioNome: 'Diego Dev',
  ...overrides,
})

const makeServico = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte TI',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  descricao: 'Problema com acesso ao sistema',
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P4,
  usuarioId: 'usuario-id-123',
  tecnicoId: null,
  descricaoEncerramento: null,
  prioridadeAlterada: null,
  encerradoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  usuario: {
    id: 'usuario-id-123',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
    setor: 'TI',
  },
  tecnico: null,
  alteradorPrioridade: null,
  servicos: [{ servico: { id: 'servico-id-123', nome: 'Suporte TI' } }],
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  email: 'tecnico@email.com',
  nome: 'Tecnico',
  nivel: 'N1',
  ...overrides,
})

const makeFile = (overrides = {}): Express.Multer.File => ({
  fieldname: 'arquivo',
  originalname: 'documento.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('fake-content'),
  destination: '',
  filename: 'documento.pdf',
  path: '',
  stream: null as any,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(gerarNumeroOS).mockResolvedValue('INC0001')
  vi.mocked(prisma.servico.findMany).mockResolvedValue([makeServico()] as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
    chamado: {
      create: vi.fn().mockResolvedValue(makeChamado()),
    },
    anexoChamado: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }))
  vi.mocked(prisma.usuario.findMany).mockResolvedValue([makeTecnico()] as any)
  vi.mocked(salvarHistoricoChamado).mockResolvedValue(undefined as any)
  vi.mocked(calcularEPersistirSLA).mockResolvedValue(undefined as any)
  vi.mocked(publicarChamadoAberto).mockResolvedValue(undefined as any)
  vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: [] })
})

describe('abrirChamadoUseCase', () => {
  describe('validação de serviço', () => {
    it('deve lançar ChamadoError quando servico for null', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: null }))).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError quando servico for undefined', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: undefined }))).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError quando servico for string vazia', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: '' }))).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError quando servico for array vazio', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: [] }))).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando sem serviço', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: null }))).rejects.toThrow(
        'É obrigatório informar pelo menos um serviço válido'
      )
    })

    it('deve lançar ChamadoError com code SERVICO_REQUIRED', async () => {
      const error = await abrirChamadoUseCase(makeInput({ servico: null })).catch(e => e)
      expect(error.code).toBe('SERVICO_REQUIRED')
    })

    it('deve lançar ChamadoError com statusCode 400 para serviço ausente', async () => {
      const error = await abrirChamadoUseCase(makeInput({ servico: null })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve aceitar servico como string válida', async () => {
      await expect(abrirChamadoUseCase(makeInput({ servico: 'Suporte TI' }))).resolves.toBeDefined()
    })

    it('deve aceitar servico como array de strings', async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([
        makeServico({ nome: 'Suporte TI' }),
        makeServico({ id: 'servico-id-456', nome: 'Infraestrutura' }),
      ] as any)

      await expect(
        abrirChamadoUseCase(makeInput({ servico: ['Suporte TI', 'Infraestrutura'] }))
      ).resolves.toBeDefined()
    })

    it('deve lançar ChamadoError quando serviço não encontrado no banco', async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([])

      await expect(abrirChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code SERVICO_NOT_FOUND quando serviço inexistente', async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([])

      const error = await abrirChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('SERVICO_NOT_FOUND')
    })

    it('deve incluir nomes dos serviços não encontrados na mensagem de erro', async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([])

      const error = await abrirChamadoUseCase(makeInput({ servico: 'ServicoInexistente' })).catch(e => e)
      expect(error.message).toContain('ServicoInexistente')
    })
  })

  describe('busca de serviços e geração de OS', () => {
    it('deve buscar serviços ativos e não deletados pelo nome', async () => {
      await abrirChamadoUseCase(makeInput())

      expect(prisma.servico.findMany).toHaveBeenCalledWith({
        where: { nome: { in: ['Suporte TI'] }, ativo: true, deletadoEm: null },
        select: { id: true, nome: true },
      })
    })

    it('deve gerar número OS em paralelo com a busca de serviços', async () => {
      await abrirChamadoUseCase(makeInput())

      expect(gerarNumeroOS).toHaveBeenCalledTimes(1)
    })

    it('deve trimar espaços do nome do serviço', async () => {
      await abrirChamadoUseCase(makeInput({ servico: '  Suporte TI  ' }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nome: { in: ['Suporte TI'] } }),
        })
      )
    })
  })

  describe('upload de arquivos', () => {
    it('não deve chamar uploadArquivos quando não há arquivos', async () => {
      await abrirChamadoUseCase(makeInput({ arquivos: [] }))

      expect(uploadArquivos).not.toHaveBeenCalled()
    })

    it('deve chamar uploadArquivos quando há arquivos', async () => {
      const arquivo = makeFile()
      vi.mocked(uploadArquivos).mockResolvedValue({
        data: [{ nomeArquivo: 'INC0001/uuid.pdf' }],
        erros: [],
      })

      await abrirChamadoUseCase(makeInput({ arquivos: [arquivo] }))

      expect(uploadArquivos).toHaveBeenCalledWith([arquivo], '', 'INC0001', 'usuario-id-123')
    })

    it('deve retornar erros de upload quando alguns arquivos falham', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({
        data: [],
        erros: ['Erro ao enviar documento.pdf: timeout'],
      })

      const result = await abrirChamadoUseCase(makeInput({ arquivos: [makeFile()] }))

      expect(result.anexos.erros).toEqual(['Erro ao enviar documento.pdf: timeout'])
    })

    it('deve retornar undefined para erros quando não há falhas de upload', async () => {
      const result = await abrirChamadoUseCase(makeInput())

      expect(result.anexos.erros).toBeUndefined()
    })

    it('deve retornar quantidade correta de arquivos enviados', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({
        data: [{ nomeArquivo: 'INC0001/uuid.pdf' }],
        erros: [],
      })

      const result = await abrirChamadoUseCase(makeInput({ arquivos: [makeFile()] }))

      expect(result.anexos.enviados).toBe(1)
    })
  })

  describe('criação do chamado', () => {
    it('deve criar chamado via transaction', async () => {
      await abrirChamadoUseCase(makeInput())

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('deve criar chamado com status ABERTO', async () => {
      let createArgs: any

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          chamado: {
            create: vi.fn().mockImplementation(async (args: any) => {
              createArgs = args
              return makeChamado()
            }),
          },
          anexoChamado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      await abrirChamadoUseCase(makeInput())

      expect(createArgs.data.status).toBe(ChamadoStatus.ABERTO)
    })

    it('deve criar chamado com prioridade P4', async () => {
      let createArgs: any

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          chamado: {
            create: vi.fn().mockImplementation(async (args: any) => {
              createArgs = args
              return makeChamado()
            }),
          },
          anexoChamado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      await abrirChamadoUseCase(makeInput())

      expect(createArgs.data.prioridade).toBe(PrioridadeChamado.P4)
    })

    it('deve criar chamado com OS gerado', async () => {
      let createArgs: any

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          chamado: {
            create: vi.fn().mockImplementation(async (args: any) => {
              createArgs = args
              return makeChamado()
            }),
          },
          anexoChamado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      await abrirChamadoUseCase(makeInput())

      expect(createArgs.data.OS).toBe('INC0001')
    })

    it('deve trimar descricao antes de criar', async () => {
      let createArgs: any

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          chamado: {
            create: vi.fn().mockImplementation(async (args: any) => {
              createArgs = args
              return makeChamado()
            }),
          },
          anexoChamado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      await abrirChamadoUseCase(makeInput({ descricao: '  Problema  ' }))

      expect(createArgs.data.descricao).toBe('Problema')
    })
  })

  describe('side effects assíncronos', () => {
    it('deve salvar histórico de abertura', async () => {
      vi.mocked(salvarHistoricoChamado).mockResolvedValue(undefined as any)

      await abrirChamadoUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: 'chamado-id-123',
          tipo: 'ABERTURA',
          para: ChamadoStatus.ABERTO,
          autorId: 'usuario-id-123',
          autorNome: 'Diego Dev',
        })
      )
    })

    it('deve calcular SLA após criação do chamado', async () => {
      await abrirChamadoUseCase(makeInput())

      expect(calcularEPersistirSLA).toHaveBeenCalledWith(
        'chamado-id-123',
        PrioridadeChamado.P4,
        DATA_FIXA
      )
    })

    it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

      await expect(abrirChamadoUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve continuar mesmo se calcularEPersistirSLA falhar', async () => {
      vi.mocked(calcularEPersistirSLA).mockRejectedValue(new Error('SLA error'))

      await expect(abrirChamadoUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve continuar mesmo se publicarChamadoAberto falhar', async () => {
      vi.mocked(publicarChamadoAberto).mockRejectedValue(new Error('Kafka error'))

      await expect(abrirChamadoUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar chamado formatado com anexos', async () => {
      const result = await abrirChamadoUseCase(makeInput())

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('OS')
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('prioridade')
      expect(result).toHaveProperty('anexos')
    })

    it('deve retornar anexos com enviados=0 quando sem arquivos', async () => {
      const result = await abrirChamadoUseCase(makeInput({ arquivos: [] }))

      expect(result.anexos.enviados).toBe(0)
    })

    it('deve retornar servicos formatados', async () => {
      const result = await abrirChamadoUseCase(makeInput())

      expect(result.servicos).toEqual([{ id: 'servico-id-123', nome: 'Suporte TI' }])
    })

    it('deve logar sucesso com chamadoId, OS e usuarioId', async () => {
      await abrirChamadoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', OS: 'INC0001', usuarioId: 'usuario-id-123' },
        '[CHAMADO] Chamado aberto'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([])

      const error = await abrirChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('SERVICO_NOT_FOUND')
    })

    it('deve lançar ChamadoError com code CREATE_ERROR quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction failed'))

      const error = await abrirChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('CREATE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction failed'))

      const error = await abrirChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction failed'))

      await expect(abrirChamadoUseCase(makeInput())).rejects.toThrow('Erro ao criar o chamado')
    })

    it('deve incluir originalError quando transaction falhar com Error', async () => {
      const txError = new Error('Transaction failed')
      vi.mocked(prisma.$transaction).mockRejectedValue(txError)

      const error = await abrirChamadoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(txError)
    })

    it('deve logar erro quando transaction falhar', async () => {
      const txError = new Error('Transaction failed')
      vi.mocked(prisma.$transaction).mockRejectedValue(txError)

      await abrirChamadoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: txError },
        '[CHAMADO] Erro ao abrir chamado'
      )
    })
  })
})