import { DomainError } from '@/domain/shared/domain.error';
import { PrismaEstoqueSetorRepository, EstoqueSetorComItem } from '@infrastructure/repositories/prisma-estoque-setor.repository';

export class ConsultarEstoqueSetorUseCase {
  constructor(private readonly estoqueSetorRepo: PrismaEstoqueSetorRepository) {}

  async execute(setor: string): Promise<EstoqueSetorComItem[]> {
    if (!setor || setor.trim().length === 0) {
      throw new DomainError('Setor é obrigatório');
    }
    return this.estoqueSetorRepo.listarPorSetor(setor.trim());
  }
}
