import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';

function converterHorarioParaDateTime(horario: string): Date {
  const [hora, minuto] = horario.split(':').map(Number);
  const date = new Date();
  date.setHours(hora, minuto, 0, 0);
  return date;
}

interface AtualizarHorariosInput {
  id: string;
  entrada: string;
  saida: string;
}

export async function atualizarHorariosUseCase(input: AtualizarHorariosInput) {
  const { id, entrada, saida } = input;

  try {
    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) {
      throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    }

    const horario = await prisma.$transaction(async (tx) => {
      await tx.expediente.updateMany({
        where: { usuarioId: id },
        data:  { deletadoEm: new Date(), ativo: false },
      });

      return tx.expediente.create({
        data: {
          usuarioId: id,
          entrada:   converterHorarioParaDateTime(entrada),
          saida:     converterHorarioParaDateTime(saida),
        },
        select: { id: true, entrada: true, saida: true, ativo: true, geradoEm: true },
      });
    });

    logger.info({ tecnicoId: id, entrada, saida }, '[TECNICO] Horários atualizados');

    return { message: 'Horário de disponibilidade atualizado com sucesso', horario };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao atualizar horários');
    throw new TecnicoError('Erro ao atualizar horários', 'HORARIOS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}