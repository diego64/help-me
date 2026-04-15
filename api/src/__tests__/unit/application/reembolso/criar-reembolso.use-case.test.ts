import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CategoriaReembolso } from '@prisma/client'

import { criarReembolsoUseCase } from '@application/use-cases/reembolso/criar-reembolso.use-case'
import { ReembolsoError } from '@application/use-cases/reembolso/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    reembolso: {
      create: vi.fn(),
    },
    anexoReembolso: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/reembolso/helpers/upload-comprovantes.helper', () => ({
  uploadComprovantes: vi.fn(),
}))

vi.mock('@application/use-cases/reembolso/helpers/numero.helper', () => ({
  gerarNumeroReembolso: vi.fn(),
}))

vi.mock('@application/use-cases/reembolso/formatters', () => ({
  formatarReembolsoResposta: vi.fn().mockReturnValue({ id: 'r1' }),
}))

import { prisma } from '@infrastructure/database/prisma/client'
import { uploadComprovantes } from '@application/use-cases/reembolso/helpers/upload-comprovantes.helper'
import { gerarNumeroReembolso } from '@application/use-cases/reembolso/helpers/numero.helper'

const makeInput = (overrides: any = {}) => ({
  descricao: 'Jantar de negócios',
  categoria: CategoriaReembolso.ALIMENTACAO,
  valor: 100,
  arquivos: [] as Express.Multer.File[],
  solicitanteId: 'solicitante-id',
  ...overrides,
})

const makeReembolso = () => ({
  id: 'reembolso-id',
  numero: 'RMB0000001',
  descricao: 'Jantar de negócios',
  categoria: CategoriaReembolso.ALIMENTACAO,
  valor: 100,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(gerarNumeroReembolso).mockResolvedValue('RMB0000001')
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'solicitante-id', setor: 'TI' } as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({
      reembolso: { create: vi.fn().mockResolvedValue(makeReembolso()) },
      anexoReembolso: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    })
  )
})

describe('criarReembolsoUseCase', () => {
  it('deve lançar VALOR_INVALIDO quando valor <= 0', async () => {
    const error = await criarReembolsoUseCase(makeInput({ valor: 0 })).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('VALOR_INVALIDO')
  })

  it('deve lançar VALOR_INVALIDO quando valor negativo', async () => {
    const error = await criarReembolsoUseCase(makeInput({ valor: -10 })).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('VALOR_INVALIDO')
  })

  it('deve lançar SOLICITANTE_NOT_FOUND quando solicitante não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

    const error = await criarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('SOLICITANTE_NOT_FOUND')
  })

  it('deve criar reembolso sem arquivos', async () => {
    const result = await criarReembolsoUseCase(makeInput())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(uploadComprovantes).not.toHaveBeenCalled()
    expect(result.comprovantes.enviados).toBe(0)
  })

  it('deve criar reembolso com arquivos e chamar uploadComprovantes', async () => {
    const arquivo = { fieldname: 'file', originalname: 'nota.pdf', size: 1024 } as Express.Multer.File

    vi.mocked(uploadComprovantes).mockResolvedValue({
      data: [{ nomeArquivo: 'RMB0000001/uuid.pdf', objetoMinio: 'path', nomeOriginal: 'nota.pdf', mimetype: 'application/pdf', tamanho: 1024 }],
      erros: [],
    })

    const result = await criarReembolsoUseCase(makeInput({ arquivos: [arquivo] }))

    expect(uploadComprovantes).toHaveBeenCalledWith([arquivo], 'RMB0000001', 'solicitante-id')
    expect(result.comprovantes.enviados).toBe(1)
  })

  it('deve retornar erros de upload quando alguns arquivos falham', async () => {
    const arquivo = { fieldname: 'file', originalname: 'nota.pdf', size: 1024 } as Express.Multer.File

    vi.mocked(uploadComprovantes).mockResolvedValue({
      data: [],
      erros: ['Erro ao enviar nota.pdf'],
    })

    const result = await criarReembolsoUseCase(makeInput({ arquivos: [arquivo] }))

    expect(result.comprovantes.erros).toEqual(['Erro ao enviar nota.pdf'])
  })

  it('deve lançar ReembolsoError CREATE_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB error'))

    const error = await criarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('CREATE_ERROR')
  })
})
