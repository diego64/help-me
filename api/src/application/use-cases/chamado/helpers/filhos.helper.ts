import { ChamadoStatus } from '@prisma/client';

export async function encerrarFilhosRecursivo(
  chamadoPaiId: string,
  osPai: string,
  tx: any
): Promise<void> {
  const filhos = await tx.chamado.findMany({
    where:  { chamadoPaiId, deletadoEm: null, status: { notIn: [ChamadoStatus.ENCERRADO, ChamadoStatus.CANCELADO] } },
    select: { id: true, OS: true },
  });

  if (!filhos.length) return;

  const agora = new Date();
  await tx.chamado.updateMany({
    where: { id: { in: filhos.map((f: any) => f.id) } },
    data:  {
      status: ChamadoStatus.ENCERRADO,
      descricaoEncerramento: `Chamado encerrado automaticamente — chamado pai ${osPai} foi encerrado`,
      encerradoEm: agora,
      atualizadoEm: agora,
    },
  });

  await Promise.all(filhos.map((f: any) => encerrarFilhosRecursivo(f.id, f.OS, tx)));
}