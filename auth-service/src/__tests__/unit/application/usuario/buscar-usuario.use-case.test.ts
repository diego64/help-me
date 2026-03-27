import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buscarUsuarioPorIdUseCase,
  buscarUsuarioPorEmailUseCase,
} from '../../../../application/usuario/buscar-usuario.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { NotFoundError } from '../../../../infrastructure/http/middlewares/error.middleware'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
  },
}))

const makeUsuarioOutput = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN',
  ativo: true,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuarioOutput() as any)
})

describe('buscarUsuarioPorIdUseCase', () => {

  describe('consulta ao banco', () => {
    it('deve buscar usuário pelo id', async () => {
      await buscarUsuarioPorIdUseCase('usuario-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
          deletadoEm: true,
        },
      })
    })

    it('não deve selecionar password', async () => {
      await buscarUsuarioPorIdUseCase('usuario-id-123')

      const chamada = vi.mocked(prisma.usuario.findUnique).mock.calls[0]![0]
      expect(chamada.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await buscarUsuarioPorIdUseCase('usuario-id-123')

      const chamada = vi.mocked(prisma.usuario.findUnique).mock.calls[0]![0]
      expect(chamada.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('quando usuário não existe', () => {
    it('deve lançar NotFoundError', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioPorIdUseCase('id-inexistente')).rejects.toThrow(NotFoundError)
    })

    it('deve lançar NotFoundError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioPorIdUseCase('id-inexistente')).rejects.toThrow('Usuário não encontrado.')
    })
  })

  describe('retorno', () => {
    it('deve retornar os dados do usuário encontrado', async () => {
      const usuario = makeUsuarioOutput()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(usuario as any)

      const result = await buscarUsuarioPorIdUseCase('usuario-id-123')

      expect(result).toEqual(usuario)
    })

    it('deve retornar deletadoEm como null quando usuário ativo', async () => {
      const result = await buscarUsuarioPorIdUseCase('usuario-id-123')

      expect(result.deletadoEm).toBeNull()
    })

    it('deve retornar deletadoEm preenchido quando usuário deletado', async () => {
      const deletadoEm = new Date('2024-06-01')
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioOutput({ deletadoEm }) as any
      )

      const result = await buscarUsuarioPorIdUseCase('usuario-id-123')

      expect(result.deletadoEm).toEqual(deletadoEm)
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await buscarUsuarioPorIdUseCase('usuario-id-123')

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('nome')
      expect(result).toHaveProperty('sobrenome')
      expect(result).toHaveProperty('email')
      expect(result).toHaveProperty('regra')
      expect(result).toHaveProperty('ativo')
      expect(result).toHaveProperty('geradoEm')
      expect(result).toHaveProperty('atualizadoEm')
      expect(result).toHaveProperty('deletadoEm')
    })
  })
})

describe('buscarUsuarioPorEmailUseCase', () => {

  describe('consulta ao banco', () => {
    it('deve buscar usuário pelo email', async () => {
      await buscarUsuarioPorEmailUseCase('diego@email.com')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'diego@email.com' },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
          deletadoEm: true,
        },
      })
    })

    it('não deve selecionar password', async () => {
      await buscarUsuarioPorEmailUseCase('diego@email.com')

      const chamada = vi.mocked(prisma.usuario.findUnique).mock.calls[0]![0]
      expect(chamada.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await buscarUsuarioPorEmailUseCase('diego@email.com')

      const chamada = vi.mocked(prisma.usuario.findUnique).mock.calls[0]![0]
      expect(chamada.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('quando usuário não existe', () => {
    it('deve lançar NotFoundError', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioPorEmailUseCase('inexistente@email.com')).rejects.toThrow(NotFoundError)
    })

    it('deve lançar NotFoundError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioPorEmailUseCase('inexistente@email.com')).rejects.toThrow('Usuário não encontrado.')
    })
  })

  describe('retorno', () => {
    it('deve retornar os dados do usuário encontrado', async () => {
      const usuario = makeUsuarioOutput()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(usuario as any)

      const result = await buscarUsuarioPorEmailUseCase('diego@email.com')

      expect(result).toEqual(usuario)
    })

    it('deve retornar deletadoEm como null quando usuário ativo', async () => {
      const result = await buscarUsuarioPorEmailUseCase('diego@email.com')

      expect(result.deletadoEm).toBeNull()
    })

    it('deve retornar deletadoEm preenchido quando usuário deletado', async () => {
      const deletadoEm = new Date('2024-06-01')
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioOutput({ deletadoEm }) as any
      )

      const result = await buscarUsuarioPorEmailUseCase('diego@email.com')

      expect(result.deletadoEm).toEqual(deletadoEm)
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await buscarUsuarioPorEmailUseCase('diego@email.com')

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('nome')
      expect(result).toHaveProperty('sobrenome')
      expect(result).toHaveProperty('email')
      expect(result).toHaveProperty('regra')
      expect(result).toHaveProperty('ativo')
      expect(result).toHaveProperty('geradoEm')
      expect(result).toHaveProperty('atualizadoEm')
      expect(result).toHaveProperty('deletadoEm')
    })
  })
})