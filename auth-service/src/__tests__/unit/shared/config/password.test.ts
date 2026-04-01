import { describe, it, expect, beforeEach } from 'vitest'

import {
  hashPassword,
  verifyPassword,
  precisaRehash,
  gerarSenhaSegura,
  validarForcaSenha,
  CONFIGURACAO_SENHA,
  _internals,
} from '../../../../shared/config/password'

const SENHA_VALIDA = 'Senha@123Forte'
const SENHA_MINIMA = 'Abc@1234' // 8 chars, todos os requisitos

describe('password', () => {
  describe('CONFIGURACAO_SENHA', () => {
    it('deve ter TAMANHO_MINIMO de 8', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MINIMO).toBe(8)
    })

    it('deve ter TAMANHO_MAXIMO de 128', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MAXIMO).toBe(128)
    })

    it('deve ter ALGORITMO PBKDF2-SHA512', () => {
      expect(CONFIGURACAO_SENHA.ALGORITMO).toBe('PBKDF2-SHA512')
    })
  })

  describe('hashPassword', () => {
    it('deve retornar string no formato pbkdf2_sha512$iterações$salt$hash', () => {
      const hash = hashPassword(SENHA_VALIDA)
      expect(hash).toMatch(/^pbkdf2_sha512\$\d+\$[0-9a-f]+\$[0-9a-f]+$/)
    })

    it('deve retornar hash com 4 partes separadas por $', () => {
      const hash = hashPassword(SENHA_VALIDA)
      expect(hash.split('$')).toHaveLength(4)
    })

    it('deve incluir número de iterações correto', () => {
      const hash = hashPassword(SENHA_VALIDA)
      const iteracoes = hash.split('$')[1]
      expect(iteracoes).toBe('600000')
    })

    it('deve gerar hashes diferentes para a mesma senha (salt único)', () => {
      const hash1 = hashPassword(SENHA_VALIDA)
      const hash2 = hashPassword(SENHA_VALIDA)
      expect(hash1).not.toBe(hash2)
    })

    it('deve lançar erro para senha menor que 8 caracteres', () => {
      expect(() => hashPassword('abc')).toThrow('Senha muito curta')
    })

    it('deve lançar erro para senha maior que 128 caracteres', () => {
      expect(() => hashPassword('A'.repeat(129))).toThrow('Senha muito longa')
    })

    it('deve lançar erro para senha vazia', () => {
      expect(() => hashPassword('')).toThrow('Senha inválida')
    })

    it('deve aceitar senha no limite mínimo (8 chars)', () => {
      expect(() => hashPassword(SENHA_MINIMA)).not.toThrow()
    })

    it('deve aceitar senha no limite máximo (128 chars)', () => {
      const senhaMaxima = 'Aa1!' + 'x'.repeat(124)
      expect(() => hashPassword(senhaMaxima)).not.toThrow()
    })

    it('deve gerar salt hexadecimal de 32 caracteres', () => {
      const hash = hashPassword(SENHA_VALIDA)
      const salt = hash.split('$')[2]
      expect(salt).toMatch(/^[0-9a-f]{32}$/)
    })

    it('deve gerar hash hexadecimal de 128 caracteres', () => {
      const hash = hashPassword(SENHA_VALIDA)
      const hashParte = hash.split('$')[3]
      expect(hashParte).toMatch(/^[0-9a-f]{128}$/)
    })
  })

  describe('verifyPassword', () => {
    let hashValido: string

    beforeEach(() => {
      hashValido = hashPassword(SENHA_VALIDA)
    })

    describe('formato PBKDF2 (atual)', () => {
      it('deve retornar true para senha correta', () => {
        expect(verifyPassword(SENHA_VALIDA, hashValido)).toBe(true)
      })

      it('deve retornar false para senha incorreta', () => {
        expect(verifyPassword('SenhaErrada@123', hashValido)).toBe(false)
      })

      it('deve retornar false para senha vazia (erro interno)', () => {
        expect(verifyPassword(SENHA_VALIDA, hashValido.replace('pbkdf2_sha512', 'outro_algo'))).toBe(false)
      })

      it('deve retornar false para hash malformado (menos de 4 partes)', () => {
        expect(verifyPassword(SENHA_VALIDA, 'pbkdf2_sha512$600000$salt')).toBe(false)
      })

      it('deve retornar false para número de iterações inválido', () => {
        expect(verifyPassword(SENHA_VALIDA, 'pbkdf2_sha512$abc$salt$hash')).toBe(false)
      })

      it('deve retornar false para iterações menores que 1', () => {
        expect(verifyPassword(SENHA_VALIDA, 'pbkdf2_sha512$0$salt$hash')).toBe(false)
      })

      it('deve ser consistente — mesma senha sempre verifica corretamente', () => {
        for (let i = 0; i < 3; i++) {
          expect(verifyPassword(SENHA_VALIDA, hashValido)).toBe(true)
        }
      })
    })

    describe('formato legado (salt:hash)', () => {
      it('deve verificar hash legado corretamente', () => {
        // Gera hash no formato legado manualmente
        const crypto = require('crypto')
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.pbkdf2Sync(SENHA_MINIMA, salt, 100000, 64, 'sha512').toString('hex')
        const hashLegado = `${salt}:${hash}`

        expect(verifyPassword(SENHA_MINIMA, hashLegado)).toBe(true)
      })

      it('deve retornar false para senha incorreta no formato legado', () => {
        const crypto = require('crypto')
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.pbkdf2Sync(SENHA_MINIMA, salt, 100000, 64, 'sha512').toString('hex')
        const hashLegado = `${salt}:${hash}`

        expect(verifyPassword('SenhaErrada@1', hashLegado)).toBe(false)
      })
    })

    describe('validação de entradas', () => {
      it('deve lançar erro para senha menor que 8 chars', () => {
        expect(() => verifyPassword('curta', hashValido)).toThrow('Senha muito curta')
      })

      it('deve lançar erro para hash vazio', () => {
        expect(() => verifyPassword(SENHA_VALIDA, '')).toThrow('Hash inválido')
      })

      it('deve retornar false para formato desconhecido', () => {
        expect(verifyPassword(SENHA_VALIDA, 'formato_desconhecido')).toBe(false)
      })

      it('deve lançar erro para hash maior que 512 chars', () => {
        const hashGrande = 'x'.repeat(513)
        expect(() => verifyPassword(SENHA_VALIDA, hashGrande)).toThrow('Hash inválido: tamanho excede limite de segurança')
      })
    })
  })

  describe('precisaRehash', () => {
    it('deve retornar false para hash atual com 600000 iterações', () => {
      const hash = hashPassword(SENHA_VALIDA)
      expect(precisaRehash(hash)).toBe(false)
    })

    it('deve retornar true para formato legado (salt:hash)', () => {
      expect(precisaRehash('somesalt:somehash')).toBe(true)
    })

    it('deve retornar true para hash com iterações antigas', () => {
      const hashAntigo = 'pbkdf2_sha512$100000$salt$hash'
      expect(precisaRehash(hashAntigo)).toBe(true)
    })

    it('deve retornar true para hash com iterações inválidas (NaN)', () => {
      const hashInvalido = 'pbkdf2_sha512$abc$salt$hash'
      expect(precisaRehash(hashInvalido)).toBe(true)
    })

    it('deve retornar true para hash PBKDF2 malformado (menos de 4 partes)', () => {
      expect(precisaRehash('pbkdf2_sha512$600000$salt')).toBe(true)
    })

    it('deve retornar true para hash vazio', () => {
      expect(precisaRehash('')).toBe(true)
    })

    it('deve retornar true para valor não-string', () => {
      expect(precisaRehash(null as any)).toBe(true)
      expect(precisaRehash(undefined as any)).toBe(true)
    })

    it('deve retornar false para formato desconhecido sem dois pontos', () => {
      expect(precisaRehash('formato_totalmente_desconhecido')).toBe(false)
    })
  })

  describe('gerarSenhaSegura', () => {
    it('deve gerar senha com tamanho padrão de 16 caracteres', () => {
      expect(gerarSenhaSegura()).toHaveLength(16)
    })

    it('deve gerar senha com tamanho especificado', () => {
      expect(gerarSenhaSegura(12)).toHaveLength(12)
      expect(gerarSenhaSegura(32)).toHaveLength(32)
    })

    it('deve conter pelo menos uma letra maiúscula', () => {
      const senha = gerarSenhaSegura()
      expect(/[A-Z]/.test(senha)).toBe(true)
    })

    it('deve conter pelo menos uma letra minúscula', () => {
      const senha = gerarSenhaSegura()
      expect(/[a-z]/.test(senha)).toBe(true)
    })

    it('deve conter pelo menos um número', () => {
      const senha = gerarSenhaSegura()
      expect(/[0-9]/.test(senha)).toBe(true)
    })

    it('deve conter pelo menos um símbolo', () => {
      const senha = gerarSenhaSegura()
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(senha)).toBe(true)
    })

    it('deve gerar senhas diferentes a cada chamada', () => {
      const senha1 = gerarSenhaSegura()
      const senha2 = gerarSenhaSegura()
      expect(senha1).not.toBe(senha2)
    })

    it('deve lançar erro quando tamanho menor que 8', () => {
      expect(() => gerarSenhaSegura(7)).toThrow('Tamanho mínimo de senha')
    })

    it('deve lançar erro quando tamanho maior que 128', () => {
      expect(() => gerarSenhaSegura(129)).toThrow('Tamanho máximo de senha')
    })

    it('deve aceitar tamanho no limite mínimo (8)', () => {
      expect(() => gerarSenhaSegura(8)).not.toThrow()
      expect(gerarSenhaSegura(8)).toHaveLength(8)
    })

    it('deve aceitar tamanho no limite máximo (128)', () => {
      expect(() => gerarSenhaSegura(128)).not.toThrow()
      expect(gerarSenhaSegura(128)).toHaveLength(128)
    })

    it('deve gerar senha que passa na validação de força', () => {
      const senha = gerarSenhaSegura()
      const validacao = validarForcaSenha(senha)
      expect(validacao.ehValida).toBe(true)
    })
  })

  describe('validarForcaSenha', () => {
    describe('retorno do objeto', () => {
      it('deve retornar objeto com ehValida, pontuacao, erros, sugestoes', () => {
        const resultado = validarForcaSenha(SENHA_VALIDA)
        expect(resultado).toHaveProperty('ehValida')
        expect(resultado).toHaveProperty('pontuacao')
        expect(resultado).toHaveProperty('erros')
        expect(resultado).toHaveProperty('sugestoes')
      })

      it('erros deve ser array', () => {
        expect(Array.isArray(validarForcaSenha(SENHA_VALIDA).erros)).toBe(true)
      })

      it('sugestoes deve ser array', () => {
        expect(Array.isArray(validarForcaSenha(SENHA_VALIDA).sugestoes)).toBe(true)
      })
    })

    describe('validação de tamanho', () => {
      it('deve reprovar senha menor que 8 caracteres', () => {
        const resultado = validarForcaSenha('Ab1!')
        expect(resultado.ehValida).toBe(false)
        expect(resultado.erros).toContain(`Senha deve ter no mínimo ${CONFIGURACAO_SENHA.TAMANHO_MINIMO} caracteres`)
      })

      it('deve dar pontuação 1 para senha de 8-11 chars', () => {
        const resultado = validarForcaSenha('Abcd@1234') // 9 chars
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(1)
        expect(resultado.sugestoes.some(s => s.includes('12+'))).toBe(true)
      })

      it('deve dar pontuação 2+ para senha de 12-15 chars', () => {
        const resultado = validarForcaSenha('Abc@12345678') // 12 chars
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(2)
      })

      it('deve dar pontuação 3+ para senha de 16+ chars', () => {
        const resultado = validarForcaSenha('Abc@1234567890AB') // 16 chars
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(3)
      })
    })

    describe('validação de complexidade', () => {
      it('deve reprovar senha sem letras maiúsculas', () => {
        const resultado = validarForcaSenha('senha@123forte')
        expect(resultado.erros).toContain('Senha deve conter letras maiúsculas')
      })

      it('deve reprovar senha sem letras minúsculas', () => {
        const resultado = validarForcaSenha('SENHA@123FORTE')
        expect(resultado.erros).toContain('Senha deve conter letras minúsculas')
      })

      it('deve reprovar senha sem números', () => {
        const resultado = validarForcaSenha('Senha@Forte!!')
        expect(resultado.erros).toContain('Senha deve conter números')
      })

      it('deve sugerir símbolos quando ausentes', () => {
        const resultado = validarForcaSenha('SenhaForte1234')
        expect(resultado.sugestoes.some(s => s.toLowerCase().includes('especiais'))).toBe(true)
      })

      it('deve dar bônus de pontuação com todos os 4 tipos de caractere', () => {
        const comTodos = validarForcaSenha('Abc@12345678') // 4 tipos
        const semSimbolo = validarForcaSenha('Abc12345678A') // 3 tipos
        expect(comTodos.pontuacao).toBeGreaterThan(semSimbolo.pontuacao)
      })
    })

    describe('detecção de padrões fracos', () => {
      it('deve reprovar senha que começa com 123456', () => {
        const resultado = validarForcaSenha('123456Abc@xx')
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true)
      })

      it('deve reprovar senha com "password"', () => {
        const resultado = validarForcaSenha('Password@123')
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true)
      })

      it('deve reprovar senha com "qwerty"', () => {
        const resultado = validarForcaSenha('Qwerty@123xx')
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true)
      })

      it('deve reprovar senha com "abc123"', () => {
        const resultado = validarForcaSenha('Abc123@xxxx!!')
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true)
      })

      it('deve reprovar senha com apenas caracteres repetidos', () => {
        const resultado = validarForcaSenha('aaaaaaaa')
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true)
      })

      it('deve aplicar penalidade de pontuação para padrão fraco', () => {
        const forte = validarForcaSenha('SenhaForte@1234')
        const fraca = validarForcaSenha('Password@123456')
        expect(forte.pontuacao).toBeGreaterThan(fraca.pontuacao)
      })
    })

    describe('senhas válidas', () => {
      it('deve aprovar senha forte com todos os requisitos', () => {
        const resultado = validarForcaSenha('Senha@Forte1234!')
        expect(resultado.ehValida).toBe(true)
        expect(resultado.erros).toHaveLength(0)
      })

      it('pontuação deve ser no máximo 4', () => {
        const resultado = validarForcaSenha('UltraForte@Super1234!!')
        expect(resultado.pontuacao).toBeLessThanOrEqual(4)
      })

      it('pontuação deve ser no mínimo 0', () => {
        const resultado = validarForcaSenha('aaaaaaaa')
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(0)
      })
    })
  })
  describe('_internals', () => {
    describe('validarEntradaSenha', () => {
      it('deve lançar erro para valor null', () => {
        expect(() => _internals.validarEntradaSenha(null, 'test')).toThrow('Senha inválida')
      })

      it('deve lançar erro para valor numérico', () => {
        expect(() => _internals.validarEntradaSenha(123, 'test')).toThrow('Senha inválida')
      })

      it('deve lançar erro para string menor que 8 chars', () => {
        expect(() => _internals.validarEntradaSenha('abc', 'test')).toThrow('Senha muito curta')
      })

      it('deve lançar erro para string maior que 128 chars', () => {
        expect(() => _internals.validarEntradaSenha('a'.repeat(129), 'test')).toThrow('Senha muito longa')
      })

      it('não deve lançar erro para senha válida', () => {
        expect(() => _internals.validarEntradaSenha(SENHA_VALIDA, 'test')).not.toThrow()
      })
    })

    describe('validarEntradaHash', () => {
      it('deve lançar erro para hash null', () => {
        expect(() => _internals.validarEntradaHash(null, 'test')).toThrow('Hash inválido')
      })

      it('deve lançar erro para hash vazio', () => {
        expect(() => _internals.validarEntradaHash('', 'test')).toThrow('Hash inválido')
      })

      it('deve lançar erro para hash maior que 512 chars', () => {
        expect(() => _internals.validarEntradaHash('x'.repeat(513), 'test')).toThrow('tamanho excede limite de segurança')
      })

      it('não deve lançar erro para hash válido', () => {
        const hash = hashPassword(SENHA_VALIDA)
        expect(() => _internals.validarEntradaHash(hash, 'test')).not.toThrow()
      })
    })

    describe('comparacaoTimingSafe', () => {
      it('deve retornar true para strings hex iguais', () => {
        const str = 'a1b2c3d4'
        expect(_internals.comparacaoTimingSafe(str, str)).toBe(true)
      })

      it('deve retornar false para strings hex diferentes', () => {
        expect(_internals.comparacaoTimingSafe('a1b2c3d4', 'e5f6g7h8')).toBe(false)
      })

      it('deve retornar false quando tamanhos são diferentes', () => {
        expect(_internals.comparacaoTimingSafe('abc', 'abcd')).toBe(false)
      })
    })

    describe('verificarHashPbkdf2', () => {
      it('deve verificar hash PBKDF2 correto', () => {
        const hash = hashPassword(SENHA_VALIDA)
        expect(_internals.verificarHashPbkdf2(SENHA_VALIDA, hash)).toBe(true)
      })

      it('deve retornar false para senha incorreta', () => {
        const hash = hashPassword(SENHA_VALIDA)
        expect(_internals.verificarHashPbkdf2('SenhaErrada@99', hash)).toBe(false)
      })

      it('deve lançar erro para hash com menos de 4 partes', () => {
        expect(() => _internals.verificarHashPbkdf2(SENHA_VALIDA, 'pbkdf2_sha512$600000$salt')).toThrow('Formato de hash PBKDF2 inválido')
      })

      it('deve lançar erro para algoritmo diferente de pbkdf2_sha512', () => {
        expect(() => _internals.verificarHashPbkdf2(SENHA_VALIDA, 'outro_algo$600000$salt$hash')).toThrow('Algoritmo não suportado')
      })

      it('deve lançar erro para iterações NaN', () => {
        expect(() => _internals.verificarHashPbkdf2(SENHA_VALIDA, 'pbkdf2_sha512$abc$salt$hash')).toThrow('Número de iterações inválido')
      })

      it('deve lançar erro para iterações menores que 1', () => {
        expect(() => _internals.verificarHashPbkdf2(SENHA_VALIDA, 'pbkdf2_sha512$0$salt$hash')).toThrow('Número de iterações inválido')
      })
    })

    describe('verificarHashLegado', () => {
      it('deve verificar hash legado correto', () => {
        const crypto = require('crypto')
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.pbkdf2Sync(SENHA_MINIMA, salt, 100000, 64, 'sha512').toString('hex')
        expect(_internals.verificarHashLegado(SENHA_MINIMA, `${salt}:${hash}`)).toBe(true)
      })

      it('deve retornar false para senha incorreta', () => {
        const crypto = require('crypto')
        const salt = crypto.randomBytes(16).toString('hex')
        const hash = crypto.pbkdf2Sync(SENHA_MINIMA, salt, 100000, 64, 'sha512').toString('hex')
        expect(_internals.verificarHashLegado('SenhaErrada@9', `${salt}:${hash}`)).toBe(false)
      })

      it('deve lançar erro para formato legado malformado', () => {
        expect(() => _internals.verificarHashLegado(SENHA_MINIMA, 'apenasumaparte')).toThrow('Formato de hash legado inválido')
      })
    })

    describe('PADROES_FRACOS_SENHA', () => {
      it('deve detectar senha começando com 123456', () => {
        expect(_internals.PADROES_FRACOS_SENHA[0]!.test('123456abc')).toBe(true)
      })

      it('deve detectar senha com "password"', () => {
        expect(_internals.PADROES_FRACOS_SENHA[1]!.test('myPassword123')).toBe(true)
      })

      it('deve detectar senha com "qwerty"', () => {
        expect(_internals.PADROES_FRACOS_SENHA[2]!.test('qwerty123')).toBe(true)
      })

      it('deve detectar senha com "abc123"', () => {
        expect(_internals.PADROES_FRACOS_SENHA[3]!.test('abc123abc')).toBe(true)
      })

      it('deve detectar senha com apenas caracteres repetidos', () => {
        expect(_internals.PADROES_FRACOS_SENHA[4]!.test('aaaaaaaa')).toBe(true)
      })

      it('não deve detectar senha forte como fraca', () => {
        const senhaForte = 'SenhaForte@1234!!'
        const algumPadraoDetectado = _internals.PADROES_FRACOS_SENHA.some(p => p.test(senhaForte))
        expect(algumPadraoDetectado).toBe(false)
      })
    })
  })

  describe('integração hashPassword + verifyPassword', () => {
    it('deve gerar hash e verificar corretamente para senha mínima', () => {
      const hash = hashPassword(SENHA_MINIMA)
      expect(verifyPassword(SENHA_MINIMA, hash)).toBe(true)
    })

    it('deve gerar hash e verificar corretamente para senha longa', () => {
      const senhaLonga = 'Aa1!' + 'x'.repeat(100)
      const hash = hashPassword(senhaLonga)
      expect(verifyPassword(senhaLonga, hash)).toBe(true)
    })

    it('hash gerado não deve precisar de rehash', () => {
      const hash = hashPassword(SENHA_VALIDA)
      expect(precisaRehash(hash)).toBe(false)
    })

    it('senha gerada deve poder ser hasheada e verificada', () => {
      const senha = gerarSenhaSegura()
      const hash = hashPassword(senha)
      expect(verifyPassword(senha, hash)).toBe(true)
    })
  })
})