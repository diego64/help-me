import { describe, it, expect } from 'vitest'

import {
  getStringParam,
  getStringParamRequired,
  getNumberParam,
  getBooleanParam,
  getNumberParamClamped,
  getArrayParam,
  getEnumParam,
} from '../../../../shared/utils/request-params'

describe('request-params', () => {
  describe('getStringParam', () => {
    it('deve retornar string quando valor é string', () => {
      expect(getStringParam('hello')).toBe('hello')
    })

    it('deve retornar string vazia quando valor é string vazia', () => {
      expect(getStringParam('')).toBe('')
    })

    it('deve retornar undefined quando valor é undefined', () => {
      expect(getStringParam(undefined)).toBeUndefined()
    })

    it('deve retornar undefined quando valor é objeto ParsedQs', () => {
      expect(getStringParam({ chave: 'valor' })).toBeUndefined()
    })

    it('deve retornar primeiro elemento quando valor é array de strings', () => {
      expect(getStringParam(['primeiro', 'segundo'])).toBe('primeiro')
    })

    it('deve retornar undefined quando array está vazio', () => {
      expect(getStringParam([])).toBeUndefined()
    })

    it('deve retornar undefined quando primeiro elemento do array é ParsedQs', () => {
      expect(getStringParam([{ chave: 'valor' }, 'segundo'])).toBeUndefined()
    })

    it('deve retornar string quando primeiro elemento do array é string', () => {
      expect(getStringParam(['abc', { chave: 'valor' }])).toBe('abc')
    })
  })

  describe('getStringParamRequired', () => {
    it('deve retornar string quando valor é string válida', () => {
      expect(getStringParamRequired('valor')).toBe('valor')
    })

    it('deve lançar erro quando valor é undefined', () => {
      expect(() => getStringParamRequired(undefined)).toThrow('Parâmetro obrigatório não fornecido')
    })

    it('deve lançar erro quando valor é string vazia', () => {
      expect(() => getStringParamRequired('')).toThrow('Parâmetro obrigatório não fornecido')
    })

    it('deve lançar erro quando valor é objeto ParsedQs', () => {
      expect(() => getStringParamRequired({ chave: 'valor' })).toThrow('Parâmetro obrigatório não fornecido')
    })

    it('deve lançar erro quando array está vazio', () => {
      expect(() => getStringParamRequired([])).toThrow('Parâmetro obrigatório não fornecido')
    })

    it('deve retornar primeiro elemento quando array começa com string', () => {
      expect(getStringParamRequired(['abc', 'def'])).toBe('abc')
    })

    it('deve lançar erro quando primeiro elemento do array não é string', () => {
      expect(() => getStringParamRequired([{ chave: 'valor' }])).toThrow('Parâmetro obrigatório não fornecido')
    })
  })

  describe('getNumberParam', () => {
    it('deve retornar número parseado de string numérica', () => {
      expect(getNumberParam('42', 0)).toBe(42)
    })

    it('deve retornar defaultValue quando valor é undefined', () => {
      expect(getNumberParam(undefined, 10)).toBe(10)
    })

    it('deve retornar defaultValue quando valor não é número', () => {
      expect(getNumberParam('abc', 5)).toBe(5)
    })

    it('deve retornar defaultValue quando valor é string vazia', () => {
      expect(getNumberParam('', 7)).toBe(7)
    })

    it('deve retornar defaultValue quando valor é objeto ParsedQs', () => {
      expect(getNumberParam({ chave: 'valor' }, 3)).toBe(3)
    })

    it('deve retornar número do primeiro elemento de array', () => {
      expect(getNumberParam(['99', 'outro'], 0)).toBe(99)
    })

    it('deve retornar defaultValue quando primeiro elemento de array não é numérico', () => {
      expect(getNumberParam(['abc'], 1)).toBe(1)
    })

    it('deve parsear usando base 10 (ignorar octal)', () => {
      expect(getNumberParam('010', 0)).toBe(10)
    })

    it('deve retornar número negativo quando string é negativa', () => {
      expect(getNumberParam('-5', 0)).toBe(-5)
    })

    it('deve truncar parte decimal', () => {
      expect(getNumberParam('3.9', 0)).toBe(3)
    })

    it('deve retornar 0 quando string é "0"', () => {
      expect(getNumberParam('0', 99)).toBe(0)
    })
  })

  describe('getBooleanParam', () => {
    it('deve retornar true para "true"', () => {
      expect(getBooleanParam('true')).toBe(true)
    })

    it('deve retornar true para "1"', () => {
      expect(getBooleanParam('1')).toBe(true)
    })

    it('deve retornar true para "yes"', () => {
      expect(getBooleanParam('yes')).toBe(true)
    })

    it('deve retornar true para "TRUE" (case insensitive)', () => {
      expect(getBooleanParam('TRUE')).toBe(true)
    })

    it('deve retornar true para "Yes" (case insensitive)', () => {
      expect(getBooleanParam('Yes')).toBe(true)
    })

    it('deve retornar false para "false"', () => {
      expect(getBooleanParam('false')).toBe(false)
    })

    it('deve retornar false para "0"', () => {
      expect(getBooleanParam('0')).toBe(false)
    })

    it('deve retornar false para "no"', () => {
      expect(getBooleanParam('no')).toBe(false)
    })

    it('deve retornar false para string vazia', () => {
      expect(getBooleanParam('')).toBe(false)
    })

    it('deve retornar false para undefined', () => {
      expect(getBooleanParam(undefined)).toBe(false)
    })

    it('deve retornar false para objeto ParsedQs', () => {
      expect(getBooleanParam({ chave: 'true' })).toBe(false)
    })

    it('deve retornar true para "true" dentro de array', () => {
      expect(getBooleanParam(['true', 'false'])).toBe(true)
    })

    it('deve retornar false para array vazio', () => {
      expect(getBooleanParam([])).toBe(false)
    })
  })

  describe('getNumberParamClamped', () => {
    it('deve retornar número dentro dos limites sem alteração', () => {
      expect(getNumberParamClamped('5', 1, 1, 10)).toBe(5)
    })

    it('deve limitar ao mínimo quando valor é menor que min', () => {
      expect(getNumberParamClamped('1', 5, 3, 10)).toBe(3)
    })

    it('deve limitar ao máximo quando valor é maior que max', () => {
      expect(getNumberParamClamped('20', 5, 1, 10)).toBe(10)
    })

    it('deve retornar defaultValue quando valor é undefined', () => {
      expect(getNumberParamClamped(undefined, 5, 1, 10)).toBe(5)
    })

    it('deve aplicar min ao defaultValue quando undefined', () => {
      expect(getNumberParamClamped(undefined, 0, 1, 10)).toBe(1)
    })

    it('deve aplicar max ao defaultValue quando undefined', () => {
      expect(getNumberParamClamped(undefined, 15, 1, 10)).toBe(10)
    })

    it('deve funcionar sem min definido', () => {
      expect(getNumberParamClamped('2', 5, undefined, 10)).toBe(2)
    })

    it('deve funcionar sem max definido', () => {
      expect(getNumberParamClamped('100', 5, 1, undefined)).toBe(100)
    })

    it('deve funcionar sem min e max', () => {
      expect(getNumberParamClamped('42', 0)).toBe(42)
    })

    it('deve retornar min quando valor é exatamente min', () => {
      expect(getNumberParamClamped('1', 5, 1, 10)).toBe(1)
    })

    it('deve retornar max quando valor é exatamente max', () => {
      expect(getNumberParamClamped('10', 5, 1, 10)).toBe(10)
    })

    it('deve retornar defaultValue clamped quando valor não é numérico', () => {
      expect(getNumberParamClamped('abc', 0, 1, 10)).toBe(1)
    })
  })

  describe('getArrayParam', () => {
    it('deve retornar array vazio para undefined', () => {
      expect(getArrayParam(undefined)).toEqual([])
    })

    it('deve retornar array vazio para objeto ParsedQs', () => {
      expect(getArrayParam({ chave: 'valor' })).toEqual([])
    })

    it('deve retornar array com único item para string simples', () => {
      expect(getArrayParam('abc')).toEqual(['abc'])
    })

    it('deve separar string por vírgula', () => {
      expect(getArrayParam('1,2,3')).toEqual(['1', '2', '3'])
    })

    it('deve remover espaços ao redor dos valores separados por vírgula', () => {
      expect(getArrayParam('a , b , c')).toEqual(['a', 'b', 'c'])
    })

    it('deve ignorar valores vazios após split', () => {
      expect(getArrayParam('a,,b')).toEqual(['a', 'b'])
    })

    it('deve retornar array de strings quando valor já é array', () => {
      expect(getArrayParam(['x', 'y', 'z'])).toEqual(['x', 'y', 'z'])
    })

    it('deve filtrar elementos não-string de array', () => {
      expect(getArrayParam(['abc', { chave: 'valor' }, 'def'])).toEqual(['abc', 'def'])
    })

    it('deve retornar array vazio para array sem strings', () => {
      expect(getArrayParam([{ a: '1' }, { b: '2' }])).toEqual([])
    })

    it('deve retornar array vazio para array vazio', () => {
      expect(getArrayParam([])).toEqual([])
    })

    it('deve retornar array com único item para string sem vírgula', () => {
      expect(getArrayParam('soloitem')).toEqual(['soloitem'])
    })
  })

  describe('getEnumParam', () => {
    const REGRAS = ['ADMIN', 'TECNICO', 'USUARIO'] as const

    it('deve retornar valor válido do enum', () => {
      expect(getEnumParam('ADMIN', REGRAS)).toBe('ADMIN')
    })

    it('deve retornar outro valor válido do enum', () => {
      expect(getEnumParam('TECNICO', REGRAS)).toBe('TECNICO')
    })

    it('deve retornar defaultValue quando valor não está no enum', () => {
      expect(getEnumParam('INVALIDO', REGRAS, 'USUARIO')).toBe('USUARIO')
    })

    it('deve retornar undefined quando valor não está no enum e sem defaultValue', () => {
      expect(getEnumParam('INVALIDO', REGRAS)).toBeUndefined()
    })

    it('deve retornar defaultValue quando valor é undefined', () => {
      expect(getEnumParam(undefined, REGRAS, 'ADMIN')).toBe('ADMIN')
    })

    it('deve retornar undefined quando valor é undefined e sem defaultValue', () => {
      expect(getEnumParam(undefined, REGRAS)).toBeUndefined()
    })

    it('deve retornar undefined quando valor é objeto ParsedQs', () => {
      expect(getEnumParam({ chave: 'ADMIN' }, REGRAS)).toBeUndefined()
    })

    it('deve extrair primeiro elemento de array e validar no enum', () => {
      expect(getEnumParam(['ADMIN', 'OUTRO'], REGRAS)).toBe('ADMIN')
    })

    it('deve retornar defaultValue quando primeiro elemento de array não está no enum', () => {
      expect(getEnumParam(['INVALIDO', 'ADMIN'], REGRAS, 'USUARIO')).toBe('USUARIO')
    })

    it('deve ser case-sensitive (não deve aceitar "admin" minúsculo)', () => {
      expect(getEnumParam('admin', REGRAS, 'USUARIO')).toBe('USUARIO')
    })

    it('deve funcionar com enum de valores numéricos como string', () => {
      const PAGINAS = ['1', '2', '3'] as const
      expect(getEnumParam('2', PAGINAS)).toBe('2')
    })

    it('deve retornar defaultValue quando array está vazio', () => {
      expect(getEnumParam([], REGRAS, 'TECNICO')).toBe('TECNICO')
    })
  })
})