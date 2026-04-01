import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';

interface ListarUsuariosInput {
  page?: number;
  limit?: number;
  regra?: Regra;
  ativo?: boolean;
  incluirDeletados?: boolean;
  busca?: string;
}

interface ListarUsuariosOutput {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  usuarios: {
    id: string;
    nome: string;
    sobrenome: string;
    email: string;
    regra: Regra;
    ativo: boolean;
    geradoEm: Date;
    atualizadoEm: Date;
    deletadoEm: Date | null;
  }[];
}

/**
 * Lista usuários com paginação e filtros
 *
 * FILTROS DISPONÍVEIS:
 * - regra: filtra por ADMIN, TECNICO ou USUARIO
 * - ativo: filtra por status ativo/inativo
 * - incluirDeletados: inclui usuários com soft delete
 * - busca: busca por nome, sobrenome ou email (case insensitive)
 */
export async function listarUsuariosUseCase(
  input: ListarUsuariosInput
): Promise<ListarUsuariosOutput> {
  const {
    page = 1,
    limit = 10,
    regra,
    ativo,
    incluirDeletados = false,
    busca,
  } = input;

  const skip = (page - 1) * limit;

  // Filtros dinâmicos para consulta
  const where = {
    ...(regra && { regra }),
    ...(ativo !== undefined && { ativo }),
    ...(!incluirDeletados && { deletadoEm: null }),
    // Busca por nome, sobrenome ou email
    ...(busca && {
      OR: [
        { nome: { contains: busca, mode: 'insensitive' as const } },
        { sobrenome: { contains: busca, mode: 'insensitive' as const } },
        { email: { contains: busca, mode: 'insensitive' as const } },
      ],
    }),
  };

  // Executa em paralelo
  const [total, usuarios] = await Promise.all([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      select: {
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        regra: true,
        ativo: true,
        geradoEm: true,
        atualizadoEm: true,
        deletadoEm: true,
      },
      orderBy: { geradoEm: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    usuarios,
  };
}