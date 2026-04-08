import { ItemInventario } from '@/domain/inventario/item-inventario.entity';
import { MovimentacaoEstoque } from '@/domain/inventario/movimentacao-estoque.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';

export interface ConsultarItemOutput {
  item: ItemInventario;
  movimentacoes: MovimentacaoEstoque[];
}

export class ConsultarItemUseCase {
  constructor(private readonly itemRepo: PrismaItemInventarioRepository) {}

  async execute(id: string): Promise<ConsultarItemOutput> {
    const [item, movimentacoes] = await Promise.all([
      this.itemRepo.buscarPorId(id),
      this.itemRepo.listarMovimentacoesPorItem(id),
    ]);

    if (!item) {
      throw new DomainError(`Item "${id}" não encontrado`);
    }

    return { item, movimentacoes };
  }
}
