import { prisma } from '@infrastructure/database/prisma/client';

export async function verificarExpedienteTecnico(tecnicoId: string): Promise<boolean> {
  const expedientes = await prisma.expediente.findMany({
    where:  { usuarioId: tecnicoId, ativo: true, deletadoEm: null },
    select: { entrada: true, saida: true },
  });

  if (!expedientes.length) return false;

  const agora     = new Date();
  const horaAtual = agora.getHours() + agora.getMinutes() / 60;

  return expedientes.some(exp => {
    const e = new Date(exp.entrada);
    const s = new Date(exp.saida);
    return horaAtual >= e.getHours() + e.getMinutes() / 60
        && horaAtual <= s.getHours() + s.getMinutes() / 60;
  });
}