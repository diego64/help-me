import { DomainError } from '@/domain/shared/domain.error';
import { ItemInventario } from '@/domain/inventario/item-inventario.entity';
import { EstoqueSetor } from '@/domain/inventario/estoque-setor.entity';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { PrismaEstoqueSetorRepository } from '@infrastructure/repositories/prisma-estoque-setor.repository';

export interface LocalizarItemOutput {
  item: ItemInventario;
  estoqueGeral: number;
  distribuicaoPorSetor: EstoqueSetor[];
}

export class LocalizarItemUseCase {
  constructor(
    private readonly itemRepo: PrismaItemInventarioRepository,
    private readonly estoqueSetorRepo: PrismaEstoqueSetorRepository,
  ) {}

  async execute(numero: string): Promise<LocalizarItemOutput> {
    if (!numero || numero.trim().length === 0) {
      throw new DomainError('Número do item é obrigatório');
    }

    const item = await this.itemRepo.buscarPorNumero(numero.trim().toUpperCase());
    if (!item) {
      throw new DomainError(`Item com número "${numero}" não encontrado`);
    }

    const distribuicaoPorSetor = await this.estoqueSetorRepo.listarPorItem(item.id);

    return {
      item,
      estoqueGeral: item.estoqueAtual,
      distribuicaoPorSetor,
    };
  }
}
