import { describe, it, expect } from 'vitest'
import { parseMoney, parseMoneyOpcional } from '@shared/money'
import { DomainError } from '@/domain/shared/domain.error'

describe('parseMoney', () => {
  it('aceita número inteiro', () => {
    expect(parseMoney(1000, 'valor')).toBe(1000)
  })

  it('aceita número com 2 casas decimais', () => {
    expect(parseMoney(1500.99, 'valor')).toBe(1500.99)
  })

  it('aceita número com 1 casa decimal', () => {
    expect(parseMoney(4500.5, 'valor')).toBe(4500.5)
  })

  it('aceita zero', () => {
    expect(parseMoney(0, 'valor')).toBe(0)
  })

  it('lança DomainError quando valor é string', () => {
    expect(() => parseMoney('1000', 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor é null', () => {
    expect(() => parseMoney(null, 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor é undefined', () => {
    expect(() => parseMoney(undefined, 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor é NaN', () => {
    expect(() => parseMoney(NaN, 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor é Infinity', () => {
    expect(() => parseMoney(Infinity, 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor é negativo', () => {
    expect(() => parseMoney(-1, 'valor')).toThrow(DomainError)
    expect(() => parseMoney(-0.01, 'valor')).toThrow(DomainError)
  })

  it('lança DomainError quando valor tem mais de 2 casas decimais', () => {
    expect(() => parseMoney(4500.999, 'valor')).toThrow(DomainError)
    expect(() => parseMoney(1.001, 'valor')).toThrow(DomainError)
  })
})

describe('parseMoneyOpcional', () => {
  it('retorna undefined quando value é undefined', () => {
    expect(parseMoneyOpcional(undefined, 'valor')).toBeUndefined()
  })

  it('retorna undefined quando value é null', () => {
    expect(parseMoneyOpcional(null, 'valor')).toBeUndefined()
  })

  it('delega para parseMoney quando value é fornecido', () => {
    expect(parseMoneyOpcional(1500.50, 'valor')).toBe(1500.50)
  })

  it('lança DomainError quando value é inválido e não-nulo', () => {
    expect(() => parseMoneyOpcional(-10, 'valor')).toThrow(DomainError)
  })
})
