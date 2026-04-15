import { DomainError } from '@/domain/shared/domain.error';

/**
 * Formato monetário da API:
 *   - Tipo:      number (JSON nativo)
 *   - Separador: ponto para decimais  → 1500.99
 *   - Casas:     no máximo 2          → 1500.9 e 1500.90 são válidos; 1500.999 não
 *   - Negativo:  não permitido
 *
 * Exemplos válidos:   1000  |  4500.50  |  1000000  |  0.99
 * Exemplos inválidos: "1000" (string) | 4500,50 (vírgula) | 4500.999 | -10
 */
export function parseMoney(value: unknown, campo: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError(`${campo}: deve ser um número (ex: 1500.99)`);
  }
  if (value < 0) {
    throw new DomainError(`${campo}: não pode ser negativo`);
  }
  const arredondado = Math.round(value * 100) / 100;
  if (arredondado !== Math.round(value * 1000) / 1000) {
    throw new DomainError(`${campo}: máximo 2 casas decimais (ex: 1500.99)`);
  }
  return arredondado;
}

export function parseMoneyOpcional(value: unknown, campo: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return parseMoney(value, campo);
}
