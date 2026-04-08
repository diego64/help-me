import { randomUUID } from 'crypto';
import { Categoria } from '@/domain/inventario/categoria.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';

export interface CriarCategoriaInput {
  nome: string;
  descricao?: string;
}

export class CriarCategoriaUseCase {
  constructor(private readonly categoriaRepo: PrismaCategoriaRepository) {}

  async execute(input: CriarCategoriaInput): Promise<Categoria> {
    const existente = await this.categoriaRepo.buscarPorNome(input.nome);

    if (existente) {
      throw new DomainError(`Categoria com nome "${input.nome}" já existe`);
    }

    const agora = new Date();
    const categoria = Categoria.create({
      id: randomUUID(),
      nome: input.nome,
      descricao: input.descricao ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    return this.categoriaRepo.criar(categoria);
  }
}
