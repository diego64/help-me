import { ParsedQs } from 'qs';

// Tipo exato que o Express retorna para req.query e req.params
type ExpressParamValue = string | ParsedQs | (string | ParsedQs)[] | undefined;


// Extrai um valor string de req.params ou req.query e lida com arrays retornando o primeiro elemento
export function getStringParam(value: ExpressParamValue): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

// Extrai um valor string obrigatório de req.params e lança erro se não encontrado
export function getStringParamRequired(value: ExpressParamValue): string {
  const result = getStringParam(value);
  if (!result) {
    throw new Error('Parâmetro obrigatório não fornecido');
  }
  return result;
}

// Extrai um número de req.query com valor padrão
export function getNumberParam(
  value: ExpressParamValue,
  defaultValue: number
): number {
  const str = getStringParam(value);
  if (!str) return defaultValue;

  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
}

// Extrai um boolean de req.query aceitando: 'true', '1', 'yes' como true
export function getBooleanParam(value: ExpressParamValue): boolean {
  const str = getStringParam(value);
  if (!str) return false;

  const normalized = str.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

// Extrai um número com limites min/max
export function getNumberParamClamped(
  value: ExpressParamValue,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  let num = getNumberParam(value, defaultValue);

  if (min !== undefined) {
    num = Math.max(min, num);
  }

  if (max !== undefined) {
    num = Math.min(max, num);
  }

  return num;
}

// Extrai uma lista de strings de req.query Ex: ?ids=1,2,3 ou ?ids[]=1&ids[]=2
export function getArrayParam(value: ExpressParamValue): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    // Suporta valores separados por vírgula: ?ids=1,2,3
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

// Extrai um enum de req.query com validação
export function getEnumParam<T extends string>(
  value: ExpressParamValue,
  validValues: readonly T[],
  defaultValue?: T
): T | undefined {
  const str = getStringParam(value);

  if (!str) {
    return defaultValue;
  }

  if (validValues.includes(str as T)) {
    return str as T;
  }

  return defaultValue;
}