import { prisma } from '@infrastructure/database/prisma/client';

const OS_PREFIX  = 'INC';
const OS_PADDING = 4;

export async function gerarNumeroOS(): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const ultimo = await tx.chamado.findFirst({
      where:   { OS: { startsWith: OS_PREFIX } },
      orderBy: { OS: 'desc' },
      select:  { OS: true },
    });

    let n = 1;
    if (ultimo?.OS) {
      const p = parseInt(ultimo.OS.replace(OS_PREFIX, ''), 10);
      if (!isNaN(p)) n = p + 1;
    }

    return `${OS_PREFIX}${String(n).padStart(OS_PADDING, '0')}`;
  });
}