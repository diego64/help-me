import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { editarChamadoUseCase } from '@application/use-cases/chamado/editar-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'
import { uploadArquivos } from '@application/use-cases/chamado/helpers/upload-arquivos.helper'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: { findUnique: vi.fn() },
    anexoChamado: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@application/use-cases/chamado/helpers/upload-arquivos.helper', () => ({
  uploadArquivos: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/selects', () => ({ CHAMADO_INCLUDE: {} }))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn((c) => c),
}))

const DATA_FIXA = new Date('2024-06-15T10:00:00.000Z')

const makeArquivo = (overrides = {}): Express.Multer.File => ({
  fieldname: 'arquivo',
  originalname: 'doc.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from(''),
  destination: '',
  filename: 'doc.pdf',
  path: '',
  stream: null as any,
  ...overrides,
})

const makeInput = (overrides = {}): Parameters<typeof editarChamadoUseCase>[0] => ({
  id: 'chamado-id-123',
  descricao: 'Nova descrição do chamado.',
  arquivos: [],
  usuarioId: 'admin-id-123',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.ABERTO,
  usuarioId: 'usuario-id-123',
  deletadoEm: null,
  ...overrides,
})

const makeChamadoAtualizado = (overrides = {}) => ({
  ...makeChamado(),
  descricao: 'Nova descrição do chamado.',
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(DATA_FIXA)

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({
      chamado:      { update: vi.fn().mockResolvedValue(makeChamadoAtualizado()) },
      anexoChamado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })
  )
  vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: [] } as any)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('editarChamadoUseCase', () => {
  describe('validação de payload vazio', () => {
    it('deve lançar ChamadoError quando não há descrição nem arquivos', async () => {
      await expect(
        editarChamadoUseCase(makeInput({ descricao: undefined, arquivos: [] }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code EMPTY_UPDATE quando payload vazio', async () => {
      const error = await editarChamadoUseCase(
        makeInput({ descricao: undefined, arquivos: [] })
      ).catch(e => e)

      expect(error.code).toBe('EMPTY_UPDATE')
    })

    it('deve lançar ChamadoError com statusCode 400 quando payload vazio', async () => {
      const error = await editarChamadoUseCase(
        makeInput({ descricao: undefined, arquivos: [] })
      ).catch(e => e)

      expect(error.statusCode).toBe(400)
    })

    it('deve aceitar quando apenas descrição é fornecida', async () => {
      await expect(
        editarChamadoUseCase(makeInput({ descricao: 'Descrição válida.', arquivos: [] }))
      ).resolves.toBeDefined()
    })

    it('deve aceitar quando apenas arquivos são fornecidos', async () => {
      await expect(
        editarChamadoUseCase(makeInput({ descricao: undefined, arquivos: [makeArquivo()] }))
      ).resolves.toBeDefined()
    })

    it('deve aceitar quando ambos descrição e arquivos são fornecidos', async () => {
      await expect(
        editarChamadoUseCase(makeInput({ descricao: 'Descrição.', arquivos: [makeArquivo()] }))
      ).resolves.toBeDefined()
    })
  })

  describe('verificação do chamado', () => {
    it('deve lançar ChamadoError quando chamado não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(editarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(editarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('guard de permissão — USUARIO', () => {
    it('deve lançar ChamadoError quando USUARIO tenta editar chamado de outro usuário', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      await expect(
        editarChamadoUseCase(makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN para USUARIO editando chamado alheio', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      const error = await editarChamadoUseCase(
        makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para USUARIO editando chamado alheio', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      const error = await editarChamadoUseCase(
        makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })

    it('deve permitir USUARIO editar seu próprio chamado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'usuario-id-123' }) as any
      )

      await expect(
        editarChamadoUseCase(makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir ADMIN editar chamado de qualquer usuário', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      await expect(
        editarChamadoUseCase(makeInput({ usuarioRegra: 'ADMIN' }))
      ).resolves.toBeDefined()
    })
  })

  describe('guard de status editável', () => {
    it.each([
      ChamadoStatus.EM_ATENDIMENTO,
      ChamadoStatus.ENCERRADO,
      ChamadoStatus.CANCELADO,
    ])('deve lançar ChamadoError para chamado com status %s', async (status) => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status }) as any
      )

      await expect(editarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para status não editável', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError com statusCode 400 para status não editável', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve permitir editar chamado ABERTO', async () => {
      await expect(editarChamadoUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir editar chamado REABERTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.REABERTO }) as any
      )

      await expect(editarChamadoUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('upload de arquivos', () => {
    it('não deve chamar uploadArquivos quando arquivos está vazio', async () => {
      await editarChamadoUseCase(makeInput({ arquivos: [] }))

      expect(uploadArquivos).not.toHaveBeenCalled()
    })

    it('deve chamar uploadArquivos quando há arquivos', async () => {
      const arquivos = [makeArquivo()]
      await editarChamadoUseCase(makeInput({ descricao: undefined, arquivos }))

      expect(uploadArquivos).toHaveBeenCalledWith(arquivos, 'chamado-id-123', 'INC0000001', 'admin-id-123')
    })

    it('deve criar anexos na transação quando uploadArquivos retorna dados', async () => {
      const anexosData = [{ url: 'https://storage/file.pdf', nome: 'doc.pdf' }]
      vi.mocked(uploadArquivos).mockResolvedValue({ data: anexosData, erros: [] } as any)

      const createMany = vi.fn().mockResolvedValue({ count: 1 })
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado:      { update: vi.fn().mockResolvedValue(makeChamadoAtualizado()) },
          anexoChamado: { createMany },
        })
      )

      await editarChamadoUseCase(makeInput({ descricao: undefined, arquivos: [makeArquivo()] }))

      expect(createMany).toHaveBeenCalledWith({ data: anexosData })
    })

    it('não deve criar anexos na transação quando upload não retorna dados', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: [] } as any)

      const createMany = vi.fn()
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado:      { update: vi.fn().mockResolvedValue(makeChamadoAtualizado()) },
          anexoChamado: { createMany },
        })
      )

      await editarChamadoUseCase(makeInput({ descricao: undefined, arquivos: [makeArquivo()] }))

      expect(createMany).not.toHaveBeenCalled()
    })
  })

  describe('atualização do chamado', () => {
    it('deve gravar descricao com trim quando fornecida', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
          anexoChamado: { createMany: vi.fn() },
        })
      )

      await editarChamadoUseCase(makeInput({ descricao: '  Descrição com espaços.  ' }))

      expect(dataGravada.descricao).toBe('Descrição com espaços.')
    })

    it('não deve incluir descricao no payload quando não fornecida', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
          anexoChamado: { createMany: vi.fn() },
        })
      )

      await editarChamadoUseCase(makeInput({ descricao: undefined, arquivos: [makeArquivo()] }))

      expect(dataGravada.descricao).toBeUndefined()
    })

    it('deve gravar atualizadoEm com a data atual', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
          anexoChamado: { createMany: vi.fn() },
        })
      )

      await editarChamadoUseCase(makeInput())

      expect(dataGravada.atualizadoEm).toEqual(DATA_FIXA)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message de sucesso', async () => {
      const result = await editarChamadoUseCase(makeInput())

      expect(result.message).toBe('Chamado atualizado com sucesso')
    })

    it('deve retornar chamado formatado', async () => {
      const result = await editarChamadoUseCase(makeInput())

      expect(result).toHaveProperty('chamado')
      expect(result.chamado).toHaveProperty('id')
    })

    it('deve retornar anexos.adicionados com quantidade correta', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({
        data: [{ url: 'file1.pdf' }, { url: 'file2.pdf' }],
        erros: [],
      } as any)

      const result = await editarChamadoUseCase(makeInput({ arquivos: [makeArquivo(), makeArquivo()] }))

      expect(result.anexos.adicionados).toBe(2)
    })

    it('deve retornar anexos.erros undefined quando não há erros de upload', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: [] } as any)

      const result = await editarChamadoUseCase(makeInput({ arquivos: [makeArquivo()] }))

      expect(result.anexos.erros).toBeUndefined()
    })

    it('deve retornar anexos.erros preenchido quando há erros de upload', async () => {
      vi.mocked(uploadArquivos).mockResolvedValue({
        data: [],
        erros: ['Falha no arquivo doc.pdf'],
      } as any)

      const result = await editarChamadoUseCase(makeInput({ arquivos: [makeArquivo()] }))

      expect(result.anexos.erros).toEqual(['Falha no arquivo doc.pdf'])
    })

    it('deve logar sucesso com chamadoId e usuarioId', async () => {
      await editarChamadoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', usuarioId: 'admin-id-123' },
        '[CHAMADO] Chamado editado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code EDIT_ERROR quando $transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('EDIT_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando $transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando $transaction falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      await expect(editarChamadoUseCase(makeInput())).rejects.toThrow('Erro ao editar o chamado')
    })

    it('deve incluir originalError quando $transaction falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      const error = await editarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com chamadoId quando $transaction falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      await editarChamadoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao editar'
      )
    })
  })
})