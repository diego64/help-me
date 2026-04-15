import { prisma } from '@infrastructure/database/prisma/client';

export async function gerarNumeroReembolso(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const ano    = new Date().getFullYear();
    const prefix = `REM-${ano}-`;

    const ultimo = await tx.reembolso.findFirst({
      where:   { numero: { startsWith: prefix } },
      orderBy: { numero: 'desc' },
      select:  { numero: true },
    });

    let n = 1;
    if (ultimo?.numero) {
      const seq = parseInt(ultimo.numero.replace(prefix, ''), 10);
      if (!isNaN(seq)) n = seq + 1;
    }

    return `${prefix}${String(n).padStart(4, '0')}`;
  });
}
