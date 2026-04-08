import { Categoria } from '@/domain/inventario/categoria.entity';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';

export interface ListarCategoriasInput {
  pagina?: number;
  limite?: number;
}

export class ListarCategoriasUseCase {
  constructor(private readonly categoriaRepo: PrismaCategoriaRepository) {}

  async execute(input: ListarCategoriasInput = {}): Promise<Categoria[]> {
    return this.categoriaRepo.listar({ pagina: input.pagina, limite: input.limite });
  }
}
