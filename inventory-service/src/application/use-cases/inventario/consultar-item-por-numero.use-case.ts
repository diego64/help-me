import { DomainError } from '@/domain/shared/domain.error';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { ConsultarItemOutput } from './consultar-item.use-case';

export class ConsultarItemPorNumeroUseCase {
  constructor(private readonly itemRepo: PrismaItemInventarioRepository) {}

  async execute(numero: string): Promise<ConsultarItemOutput> {
    const item = await this.itemRepo.buscarPorNumero(numero);

    if (!item) {
      throw new DomainError(`Item "${numero}" não encontrado`);
    }

    const movimentacoes = await this.itemRepo.listarMovimentacoesPorItem(item.id);

    return { item, movimentacoes };
  }
}
