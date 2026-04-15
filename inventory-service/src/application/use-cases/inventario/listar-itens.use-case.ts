import { ItemInventario } from '@/domain/inventario/item-inventario.entity';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';

export interface ListarItensInput {
  nome?: string;
  categoriaId?: string;
  estoqueCritico?: boolean;
  pagina?: number;
  limite?: number;
}

export class ListarItensUseCase {
  constructor(private readonly itemRepo: PrismaItemInventarioRepository) {}

  async execute(input: ListarItensInput = {}): Promise<ItemInventario[]> {
    return this.itemRepo.listar({
      nome: input.nome,
      categoriaId: input.categoriaId,
      estoqueCritico: input.estoqueCritico,
      pagina: input.pagina,
      limite: input.limite,
    });
  }
}
