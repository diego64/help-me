import { Setor } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { cacheGet, cacheSet } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';
import { USUARIO_SELECT, REGRAS_USUARIO } from './selects';

const CACHE_TTL = 60;
const CACHE_KEY_PREFIX = 'usuarios:';

interface ListarUsuariosInput {
  page: number;
  limit: number;
  incluirInativos?: boolean;
  incluirDeletados?: boolean;
  setor?: string;
  busca?: string;
}

export async function listarUsuariosUseCase(input: ListarUsuariosInput) {
  const { page, limit, incluirInativos, incluirDeletados, setor, busca } = input;
  const skip = (page - 1) * limit;

  try {
    const cacheKey = `${CACHE_KEY_PREFIX}list:${page}:${limit}:${incluirInativos}:${incluirDeletados}:${setor}:${busca}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);

    const where: any = { regra: { in: REGRAS_USUARIO } };
    if (!incluirInativos)  where.ativo      = true;
    if (!incluirDeletados) where.deletadoEm = null;
    if (setor) where.setor = setor as Setor;
    if (busca) {
      where.OR = [
        { nome:      { contains: busca, mode: 'insensitive' } },
        { sobrenome: { contains: busca, mode: 'insensitive' } },
        { email:     { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, usuarios] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        select:  USUARIO_SELECT,
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const response = {
      data: usuarios,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };

    await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL);

    logger.info({ total, page, limit }, '[USUARIO] Listagem realizada');

    return response;
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error }, '[USUARIO] Erro ao listar');
    throw new UsuarioError('Erro ao listar usuários', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}