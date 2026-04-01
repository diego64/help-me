import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { buscarAdminUseCase } from '@application/use-cases/admin/buscar-admin.use-case'
import { AdminError } from '@application/use-cases/admin/errors'
import { ADMIN_SELECT } from '@application/use-cases/admin/selects'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
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

const makeAdmin = (overrides = {}) => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  setor: 'TI',
  telefone: '11999999999',
  ramal: '1234',
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeAdmin() as any)
})

describe('buscarAdminUseCase', () => {
  describe('consulta ao banco', () => {
    it('deve buscar admin pelo id', async () => {
      await buscarAdminUseCase('admin-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
        select: ADMIN_SELECT,
      })
    })

    it('deve usar ADMIN_SELECT com todos os campos corretos', async () => {
      await buscarAdminUseCase('admin-id-123')

      const [args] = vi.mocked(prisma.usuario.findUnique).mock.calls[0] ?? []
      expect(args?.select).toEqual({
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        regra: true,
        setor: true,
        telefone: true,
        ramal: true,
        avatarUrl: true,
        ativo: true,
        geradoEm: true,
        atualizadoEm: true,
        deletadoEm: true,
      })
    })

    it('não deve selecionar password', async () => {
      await buscarAdminUseCase('admin-id-123')

      const [args] = vi.mocked(prisma.usuario.findUnique).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await buscarAdminUseCase('admin-id-123')

      const [args] = vi.mocked(prisma.usuario.findUnique).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('quando admin não existe', () => {
    it('deve lançar AdminError quando findUnique retornar null', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarAdminUseCase('admin-id-123')).rejects.toThrow('Administrador não encontrado')
    })

    it('deve lançar AdminError com code NOT_FOUND', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com statusCode 404', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('quando usuário existe mas não é ADMIN', () => {
    it('deve lançar AdminError para regra TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(buscarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError para regra USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(buscarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com code NOT_FOUND quando regra incorreta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra }) as any
      )

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com statusCode 404 quando regra incorreta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra }) as any
      )

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do admin encontrado', async () => {
      const admin = makeAdmin()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(admin as any)

      const result = await buscarAdminUseCase('admin-id-123')

      expect(result).toEqual(admin)
    })

    it('deve retornar deletadoEm null para admin ativo', async () => {
      const result = await buscarAdminUseCase('admin-id-123')
      expect(result.deletadoEm).toBeNull()
    })

    it('deve retornar deletadoEm preenchido para admin soft deleted', async () => {
      const deletadoEm = new Date('2024-06-01')
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ deletadoEm }) as any
      )

      const result = await buscarAdminUseCase('admin-id-123')
      expect(result.deletadoEm).toEqual(deletadoEm)
    })

    it('deve logar sucesso com adminId', async () => {
      await buscarAdminUseCase('admin-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { adminId: 'admin-id-123' },
        '[ADMIN] Admin encontrado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar AdminError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com code GET_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('GET_ERROR')
    })

    it('deve lançar AdminError com statusCode 500 quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar AdminError com mensagem correta quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(buscarAdminUseCase('admin-id-123')).rejects.toThrow('Erro ao buscar administrador')
    })

    it('deve incluir originalError quando findUnique falhar com Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando findUnique falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      await buscarAdminUseCase('admin-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, adminId: 'admin-id-123' },
        '[ADMIN] Erro ao buscar admin'
      )
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue('string error')

      const error = await buscarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })
  })
})