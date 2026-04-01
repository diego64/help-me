import { Regra, Setor, NivelTecnico } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';
import { TECNICO_SELECT } from './selects';

const NIVEIS_VALIDOS: NivelTecnico[] = ['N1', 'N2', 'N3'];

interface ListarTecnicosInput {
  page: number;
  limit: number;
  incluirInativos?: boolean;
  incluirDeletados?: boolean;
  setor?: string;
  nivel?: string;
  busca?: string;
}

export async function listarTecnicosUseCase(input: ListarTecnicosInput) {
  const { page, limit, incluirInativos, incluirDeletados, setor, nivel, busca } = input;
  const skip = (page - 1) * limit;

  try {
    const where: any = { regra: Regra.TECNICO };
    if (!incluirInativos)  where.ativo      = true;
    if (!incluirDeletados) where.deletadoEm = null;
    if (setor) where.setor = setor as Setor;
    if (nivel && NIVEIS_VALIDOS.includes(nivel as NivelTecnico)) where.nivel = nivel as NivelTecnico;
    if (busca) {
      where.OR = [
        { nome:      { contains: busca, mode: 'insensitive' } },
        { sobrenome: { contains: busca, mode: 'insensitive' } },
        { email:     { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, tecnicos] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        select:  TECNICO_SELECT,
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info({ total, page, limit }, '[TECNICO] Listagem realizada');

    return {
      data: tecnicos,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error }, '[TECNICO] Erro ao listar');
    throw new TecnicoError('Erro ao listar técnicos', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}