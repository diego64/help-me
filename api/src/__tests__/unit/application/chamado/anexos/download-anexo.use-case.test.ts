import { describe, it, expect, vi, beforeEach } from 'vitest'

import { downloadAnexoUseCase } from '@application/use-cases/chamado/anexos/download-anexo.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { minioClient } from '@infrastructure/storage/minio.client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    anexoChamado: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@infrastructure/storage/minio.client', () => ({
  minioClient: {
    presignedGetObject: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof downloadAnexoUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  anexoId: 'anexo-id-123',
  ...overrides,
})

const makeAnexo = (overrides = {}) => ({
  id: 'anexo-id-123',
  chamadoId: 'chamado-id-123',
  nomeOriginal: 'documento.pdf',
  mimetype: 'application/pdf',
  tamanho: 1024,
  bucketMinio: 'helpme-bucket',
  objetoMinio: 'INC0001/uuid.pdf',
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(makeAnexo() as any)
  vi.mocked(minioClient.presignedGetObject).mockResolvedValue('https://minio.example.com/helpme-bucket/INC0001/uuid.pdf?X-Amz-Expires=600')
})

describe('downloadAnexoUseCase', () => {
  describe('busca do anexo', () => {
    it('deve buscar anexo pelo id com select correto', async () => {
      await downloadAnexoUseCase(makeInput())

      expect(prisma.anexoChamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'anexo-id-123' },
        select: {
          id: true,
          chamadoId: true,
          nomeOriginal: true,
          mimetype: true,
          tamanho: true,
          bucketMinio: true,
          objetoMinio: true,
          deletadoEm: true,
        },
      })
    })
  })

  describe('verificação de existência do anexo', () => {
    it('deve lançar ChamadoError quando anexo não existir', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      await expect(downloadAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      await expect(downloadAnexoUseCase(makeInput())).rejects.toThrow('Anexo não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando anexo já foi deletado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(downloadAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para anexo deletado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError quando chamadoId do anexo não bate', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ chamadoId: 'outro-chamado-id' }) as any
      )

      await expect(downloadAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamadoId não bate', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ chamadoId: 'outro-chamado-id' }) as any
      )

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('geração da URL presignada', () => {
    it('deve chamar presignedGetObject com bucket e objeto corretos', async () => {
      await downloadAnexoUseCase(makeInput())

      expect(minioClient.presignedGetObject).toHaveBeenCalledWith(
        'helpme-bucket',
        'INC0001/uuid.pdf',
        600
      )
    })

    it('deve usar TTL de 10 minutos (600 segundos)', async () => {
      await downloadAnexoUseCase(makeInput())

      const [, , ttl] = vi.mocked(minioClient.presignedGetObject).mock.calls[0] ?? []
      expect(ttl).toBe(600)
    })

    it('deve usar o bucketMinio do anexo', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ bucketMinio: 'outro-bucket' }) as any
      )

      await downloadAnexoUseCase(makeInput())

      const [bucket] = vi.mocked(minioClient.presignedGetObject).mock.calls[0] ?? []
      expect(bucket).toBe('outro-bucket')
    })

    it('deve usar o objetoMinio do anexo', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ objetoMinio: 'INC0002/outro-uuid.png' }) as any
      )

      await downloadAnexoUseCase(makeInput())

      const [, objeto] = vi.mocked(minioClient.presignedGetObject).mock.calls[0] ?? []
      expect(objeto).toBe('INC0002/outro-uuid.png')
    })
  })

  describe('retorno', () => {
    it('deve retornar url gerada pelo MinIO', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.url).toBe('https://minio.example.com/helpme-bucket/INC0001/uuid.pdf?X-Amz-Expires=600')
    })

    it('deve retornar expiraEm como ISO string', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(typeof result.expiraEm).toBe('string')
      expect(() => new Date(result.expiraEm)).not.toThrow()
    })

    it('deve retornar expiraEm aproximadamente 10 minutos no futuro', async () => {
      const antes = Date.now()
      const result = await downloadAnexoUseCase(makeInput())
      const depois = Date.now()

      const expiraEm = new Date(result.expiraEm).getTime()
      const dezMinutos = 10 * 60 * 1000

      expect(expiraEm).toBeGreaterThanOrEqual(antes + dezMinutos)
      expect(expiraEm).toBeLessThanOrEqual(depois + dezMinutos)
    })

    it('deve retornar arquivo com id correto', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.arquivo.id).toBe('anexo-id-123')
    })

    it('deve retornar arquivo com nomeOriginal correto', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.arquivo.nomeOriginal).toBe('documento.pdf')
    })

    it('deve retornar arquivo com mimetype correto', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.arquivo.mimetype).toBe('application/pdf')
    })

    it('deve retornar arquivo com tamanho correto', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.arquivo.tamanho).toBe(1024)
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('expiraEm')
      expect(result).toHaveProperty('arquivo')
      expect(result.arquivo).toHaveProperty('id')
      expect(result.arquivo).toHaveProperty('nomeOriginal')
      expect(result.arquivo).toHaveProperty('mimetype')
      expect(result.arquivo).toHaveProperty('tamanho')
    })

    it('não deve expor bucketMinio e objetoMinio no retorno', async () => {
      const result = await downloadAnexoUseCase(makeInput())

      expect(result.arquivo).not.toHaveProperty('bucketMinio')
      expect(result.arquivo).not.toHaveProperty('objetoMinio')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId e anexoId', async () => {
      await downloadAnexoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', anexoId: 'anexo-id-123' },
        '[CHAMADO] URL de download gerada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code ANEXO_DOWNLOAD_ERROR quando presignedGetObject falhar', async () => {
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue(new Error('MinIO error'))

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('ANEXO_DOWNLOAD_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando MinIO falhar', async () => {
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue(new Error('MinIO error'))

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando MinIO falhar', async () => {
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue(new Error('MinIO error'))

      await expect(downloadAnexoUseCase(makeInput())).rejects.toThrow('Erro ao gerar URL de download')
    })

    it('deve incluir originalError quando MinIO falhar com instância de Error', async () => {
      const minioError = new Error('MinIO error')
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue(minioError)

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(minioError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue('string error')

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId e anexoId quando falhar', async () => {
      const minioError = new Error('MinIO error')
      vi.mocked(minioClient.presignedGetObject).mockRejectedValue(minioError)

      await downloadAnexoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: minioError, chamadoId: 'chamado-id-123', anexoId: 'anexo-id-123' },
        '[CHAMADO] Erro ao gerar URL de download'
      )
    })

    it('deve lançar ChamadoError com code ANEXO_DOWNLOAD_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await downloadAnexoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('ANEXO_DOWNLOAD_ERROR')
    })
  })
})