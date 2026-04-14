import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { uploadAnexosUseCase } from '@application/use-cases/chamado/upload-anexos.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    anexoChamado: {
      createMany: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/chamado/helpers/upload-arquivos.helper', () => ({
  uploadArquivos: vi.fn(),
}))

import { prisma } from '@infrastructure/database/prisma/client'
import { uploadArquivos } from '@application/use-cases/chamado/helpers/upload-arquivos.helper'

const makeFile = (): Express.Multer.File => ({
  fieldname: 'arquivo',
  originalname: 'doc.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('fake'),
  destination: '',
  filename: 'doc.pdf',
  path: '',
  stream: null as any,
})

const makeInput = (overrides: any = {}) => ({
  chamadoId: 'chamado-id-123',
  arquivos: [makeFile()],
  autorId: 'autor-id',
  ...overrides,
})

const makeChamado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.ABERTO,
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(uploadArquivos).mockResolvedValue({ data: [{ nomeArquivo: 'INC0000001/uuid.pdf' }], erros: [] })
  vi.mocked(prisma.anexoChamado.createMany).mockResolvedValue({ count: 1 })
})

describe('uploadAnexosUseCase', () => {
  it('deve lançar NO_FILES quando nenhum arquivo enviado', async () => {
    const error = await uploadAnexosUseCase(makeInput({ arquivos: [] })).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NO_FILES')
  })

  it('deve lançar NOT_FOUND quando chamado não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

    const error = await uploadAnexosUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar NOT_FOUND quando chamado está deletado', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ deletadoEm: new Date() }) as any
    )

    const error = await uploadAnexosUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar INVALID_STATUS quando chamado está CANCELADO', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ status: ChamadoStatus.CANCELADO }) as any
    )

    const error = await uploadAnexosUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('INVALID_STATUS')
  })

  it('deve lançar INVALID_STATUS quando chamado está ENCERRADO', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
    )

    const error = await uploadAnexosUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('INVALID_STATUS')
  })

  it('deve chamar uploadArquivos e createMany quando há dados', async () => {
    await uploadAnexosUseCase(makeInput())

    expect(uploadArquivos).toHaveBeenCalledWith([makeFile()], 'chamado-id-123', 'INC0000001', 'autor-id')
    expect(prisma.anexoChamado.createMany).toHaveBeenCalledTimes(1)
  })

  it('não deve chamar createMany quando uploadArquivos retorna dados vazios', async () => {
    vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: ['Erro no upload'] })

    await uploadAnexosUseCase(makeInput())

    expect(prisma.anexoChamado.createMany).not.toHaveBeenCalled()
  })

  it('deve retornar mensagem de sucesso com count correto', async () => {
    const result = await uploadAnexosUseCase(makeInput())

    expect(result.enviados).toBe(1)
    expect(result.message).toContain('1')
  })

  it('deve retornar erros quando há falhas no upload', async () => {
    vi.mocked(uploadArquivos).mockResolvedValue({ data: [], erros: ['Erro ao enviar doc.pdf'] })

    const result = await uploadAnexosUseCase(makeInput())

    expect(result.erros).toEqual(['Erro ao enviar doc.pdf'])
  })

  it('deve retornar undefined para erros quando não há falhas', async () => {
    const result = await uploadAnexosUseCase(makeInput())

    expect(result.erros).toBeUndefined()
  })

  it('deve lançar ChamadoError UPLOAD_ERROR em erro inesperado', async () => {
    vi.mocked(uploadArquivos).mockRejectedValue(new Error('Upload failed'))

    const error = await uploadAnexosUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('UPLOAD_ERROR')
  })
})
