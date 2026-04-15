import { prisma } from './prisma.client';

type TipoNumero = 'INV' | 'AC' | 'OC';

const PREFIXOS: Record<TipoNumero, string> = {
  INV: 'INV',
  AC: 'AC',
  OC: 'OC',
};

/**
 * Gera o próximo número sequencial para o tipo informado de forma atômica.
 * Usa upsert para garantir que não há duplicatas mesmo com acessos concorrentes.
 *
 * Exemplos: INV0000001 | AC0000001 | OC0000001
 */
export async function proximoNumero(tipo: TipoNumero): Promise<string> {
  const contador = await prisma.contador.upsert({
    where: { tipo },
    update: { ultimo: { increment: 1 } },
    create: { tipo, ultimo: 1 },
  });

  return `${PREFIXOS[tipo]}${String(contador.ultimo).padStart(7, '0')}`;
}
