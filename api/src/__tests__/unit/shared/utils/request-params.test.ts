import { describe, it, expect } from 'vitest'

import {
  getStringParam,
  getStringParamRequired,
  getNumberParam,
  getBooleanParam,
  getNumberParamClamped,
  getArrayParam,
  getEnumParam,
} from '@shared/utils/request-params'

describe('getStringParam', () => {
  it('deve retornar string quando valor é string', () => {
    expect(getStringParam('hello')).toBe('hello')
  })

  it('deve retornar o primeiro elemento quando valor é array de strings', () => {
    expect(getStringParam(['a', 'b'])).toBe('a')
  })

  it('deve retornar undefined quando valor é undefined', () => {
    expect(getStringParam(undefined)).toBeUndefined()
  })

  it('deve retornar undefined quando valor é objeto ParsedQs', () => {
    expect(getStringParam({ key: 'value' } as any)).toBeUndefined()
  })

  it('deve retornar undefined quando array contém ParsedQs como primeiro elemento', () => {
    expect(getStringParam([{ key: 'value' } as any, 'b'])).toBeUndefined()
  })
})

describe('getStringParamRequired', () => {
  it('deve retornar valor quando presente', () => {
    expect(getStringParamRequired('test')).toBe('test')
  })

  it('deve lançar erro quando valor é undefined', () => {
    expect(() => getStringParamRequired(undefined)).toThrow('Parâmetro obrigatório não fornecido')
  })

  it('deve lançar erro quando valor é string vazia', () => {
    expect(() => getStringParamRequired('')).toThrow('Parâmetro obrigatório não fornecido')
  })
})

describe('getNumberParam', () => {
  it('deve retornar número válido', () => {
    expect(getNumberParam('42', 0)).toBe(42)
  })

  it('deve retornar defaultValue quando string inválida', () => {
    expect(getNumberParam('abc', 5)).toBe(5)
  })

  it('deve retornar defaultValue quando undefined', () => {
    expect(getNumberParam(undefined, 10)).toBe(10)
  })

  it('deve retornar número quando string numérica em array', () => {
    expect(getNumberParam(['7', '8'], 0)).toBe(7)
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

  it('deve retornar false para "false"', () => {
    expect(getBooleanParam('false')).toBe(false)
  })

  it('deve retornar false para undefined', () => {
    expect(getBooleanParam(undefined)).toBe(false)
  })

  it('deve retornar false para string não reconhecida', () => {
    expect(getBooleanParam('no')).toBe(false)
  })
})

describe('getNumberParamClamped', () => {
  it('deve retornar o valor quando dentro dos limites', () => {
    expect(getNumberParamClamped('5', 1, 1, 10)).toBe(5)
  })

  it('deve limitar ao mínimo', () => {
    expect(getNumberParamClamped('0', 1, 1, 10)).toBe(1)
  })

  it('deve limitar ao máximo', () => {
    expect(getNumberParamClamped('20', 1, 1, 10)).toBe(10)
  })

  it('deve usar defaultValue quando undefined', () => {
    expect(getNumberParamClamped(undefined, 5, 1, 10)).toBe(5)
  })

  it('deve funcionar sem min/max', () => {
    expect(getNumberParamClamped('42', 0)).toBe(42)
  })

  it('deve aplicar apenas min quando max não fornecido', () => {
    expect(getNumberParamClamped('0', 5, 1)).toBe(1)
  })

  it('deve aplicar apenas max quando min não fornecido', () => {
    expect(getNumberParamClamped('100', 5, undefined, 10)).toBe(10)
  })
})

describe('getArrayParam', () => {
  it('deve retornar array de strings filtrado', () => {
    expect(getArrayParam(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('deve filtrar elementos não-string de arrays', () => {
    expect(getArrayParam(['a', { key: 'v' } as any, 'b'])).toEqual(['a', 'b'])
  })

  it('deve dividir string separada por vírgula', () => {
    expect(getArrayParam('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('deve trimar espaços na string separada por vírgula', () => {
    expect(getArrayParam('a, b, c')).toEqual(['a', 'b', 'c'])
  })

  it('deve retornar array vazio para undefined', () => {
    expect(getArrayParam(undefined)).toEqual([])
  })

  it('deve retornar array vazio para ParsedQs object', () => {
    expect(getArrayParam({ key: 'value' } as any)).toEqual([])
  })
})

describe('getEnumParam', () => {
  const validValues = ['ABERTO', 'FECHADO', 'PENDENTE'] as const

  it('deve retornar valor quando válido', () => {
    expect(getEnumParam('ABERTO', validValues)).toBe('ABERTO')
  })

  it('deve retornar defaultValue quando string não está nos valores válidos', () => {
    expect(getEnumParam('INVALIDO', validValues, 'ABERTO')).toBe('ABERTO')
  })

  it('deve retornar undefined quando undefined e sem defaultValue', () => {
    expect(getEnumParam(undefined, validValues)).toBeUndefined()
  })

  it('deve retornar defaultValue quando undefined com defaultValue', () => {
    expect(getEnumParam(undefined, validValues, 'PENDENTE')).toBe('PENDENTE')
  })

  it('deve retornar undefined quando valor inválido sem defaultValue', () => {
    expect(getEnumParam('INVALIDO', validValues)).toBeUndefined()
  })
})
