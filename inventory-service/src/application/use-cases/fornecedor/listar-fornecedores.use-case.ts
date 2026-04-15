import { Fornecedor } from '@/domain/inventario/fornecedor.entity';
import { PrismaFornecedorRepository } from '@infrastructure/repositories/prisma-fornecedor.repository';

export interface ListarFornecedoresInput {
  pagina?: number;
  limite?: number;
}

export class ListarFornecedoresUseCase {
  constructor(private readonly fornecedorRepo: PrismaFornecedorRepository) {}

  async execute(input: ListarFornecedoresInput = {}): Promise<Fornecedor[]> {
    return this.fornecedorRepo.listar({ pagina: input.pagina, limite: input.limite });
  }
}
