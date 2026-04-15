import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';

export interface AtualizarItemInput {
  id: string;
  nome?: string;
  descricao?: string | null;
  unidade?: UnidadeMedida;
  estoqueMinimo?: number;
  categoriaId?: string;
}

export class AtualizarItemUseCase {
  constructor(
    private readonly itemRepo: PrismaItemInventarioRepository,
    private readonly categoriaRepo: PrismaCategoriaRepository,
  ) {}

  async execute(input: AtualizarItemInput): Promise<ItemInventario> {
    const item = await this.itemRepo.buscarPorId(input.id);

    if (!item) {
      throw new DomainError(`Item "${input.id}" não encontrado`);
    }

    if (input.categoriaId && input.categoriaId !== item.categoriaId) {
      const categoria = await this.categoriaRepo.buscarPorId(input.categoriaId);
      if (!categoria) {
        throw new DomainError(`Categoria "${input.categoriaId}" não encontrada`);
      }
    }

    const atualizado = item.atualizar({
      nome: input.nome,
      descricao: input.descricao,
      unidade: input.unidade,
      estoqueMinimo: input.estoqueMinimo,
      categoriaId: input.categoriaId,
    });

    return this.itemRepo.atualizar(atualizado);
  }
}
