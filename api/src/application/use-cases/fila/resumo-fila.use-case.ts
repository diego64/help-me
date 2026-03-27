import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';

const PRIORIDADES_ALTA:  PrioridadeChamado[] = ['P1', 'P2', 'P3'];
const PRIORIDADES_BAIXA: PrioridadeChamado[] = ['P4', 'P5'];
const STATUS_FILA: ChamadoStatus[] = [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO];

interface ResumoFilaInput {
  usuarioId: string;
  usuarioRegra: string;
}

export async function resumoFilaUseCase(input: ResumoFilaInput) {
  const { usuarioId, usuarioRegra } = input;

  try {
    let nivel: NivelTecnico | null = null;

    if (usuarioRegra === 'TECNICO') {
      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      nivel = tecnico?.nivel ?? null;
    }

    const mostrarAlta  = usuarioRegra === 'ADMIN' || nivel === NivelTecnico.N2 || nivel === NivelTecnico.N3;
    const mostrarBaixa = usuarioRegra === 'ADMIN' || nivel === NivelTecnico.N1;

    const prioridadesVisiveis: PrioridadeChamado[] = [
      ...(mostrarAlta  ? PRIORIDADES_ALTA  : []),
      ...(mostrarBaixa ? PRIORIDADES_BAIXA : []),
    ];

    const contagens = await prisma.chamado.groupBy({
      by:    ['prioridade'],
      where: { status: { in: STATUS_FILA }, prioridade: { in: prioridadesVisiveis }, deletadoEm: null },
      _count: { id: true },
    });

    const porPrioridade: Record<string, number> = Object.fromEntries(
      contagens.map(c => [c.prioridade, c._count.id])
    );

    const totalAlta  = PRIORIDADES_ALTA.reduce((acc, p)  => acc + (porPrioridade[p] ?? 0), 0);
    const totalBaixa = PRIORIDADES_BAIXA.reduce((acc, p) => acc + (porPrioridade[p] ?? 0), 0);

    logger.info({ usuarioId, mostrarAlta, mostrarBaixa }, '[FILA] Resumo consultado');

    return {
      filas: {
        ...(mostrarAlta ? {
          alta: {
            total: totalAlta,
            prioridades: { P1: porPrioridade['P1'] ?? 0, P2: porPrioridade['P2'] ?? 0, P3: porPrioridade['P3'] ?? 0 },
          },
        } : {}),
        ...(mostrarBaixa ? {
          baixa: {
            total: totalBaixa,
            prioridades: { P4: porPrioridade['P4'] ?? 0, P5: porPrioridade['P5'] ?? 0 },
          },
        } : {}),
      },
      totalGeral: (mostrarAlta ? totalAlta : 0) + (mostrarBaixa ? totalBaixa : 0),
    };
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error }, '[FILA] Erro ao buscar resumo');
    throw new FilaError('Erro ao buscar resumo das filas', 'RESUMO_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}