import { prisma } from '@infrastructure/database/prisma/client';
import { publicarSLAVencendo } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { logger } from '@shared/config/logger';

const SLA_ALERTA_HORAS = 20; // Alerta quando falta 4h para vencer SLA de 24h

export async function verificarSLAVencendo(): Promise<void> {
  try {
    const limiteAlerta = new Date(Date.now() - SLA_ALERTA_HORAS * 60 * 60 * 1000);
    const limiteVencido = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Chamados entre 20h e 24h abertos (zona de alerta)
    const chamados = await prisma.chamado.findMany({
      where: {
        status: { in: ['ABERTO', 'EM_ATENDIMENTO'] },
        geradoEm: { lte: limiteAlerta, gte: limiteVencido },
        tecnicoId: { not: null },
        deletadoEm: null,
      },
      select: {
        id: true, OS: true, prioridade: true, geradoEm: true,
        tecnico: { select: { id: true, email: true, nome: true, nivel: true } },
      },
    });

    logger.info({ qtd: chamados.length }, 'Verificação SLA — chamados em alerta');

    await Promise.allSettled(
      chamados.map(async (chamado) => {
        if (!chamado.tecnico) return;

        const horasAberto = Math.floor(
          (Date.now() - new Date(chamado.geradoEm).getTime()) / (1000 * 60 * 60)
        );

        await publicarSLAVencendo({
          chamadoId: chamado.id,
          chamadoOS: chamado.OS,
          prioridade: chamado.prioridade,
          horasAberto,
          tecnico: {
            id: chamado.tecnico.id,
            email: chamado.tecnico.email,
            nome: chamado.tecnico.nome,
            nivel: chamado.tecnico.nivel,
          },
        });
      })
    );
  } catch (err) {
    logger.error({ err }, 'Erro na verificação de SLA');
  }
}

// Inicia o job com intervalo de 30 minutos
export function startSLAJob(): NodeJS.Timeout {
  logger.info('SLA Job iniciado (intervalo: 30min)');
  verificarSLAVencendo(); // Roda imediatamente ao iniciar
  return setInterval(verificarSLAVencendo, 30 * 60 * 1000);
}