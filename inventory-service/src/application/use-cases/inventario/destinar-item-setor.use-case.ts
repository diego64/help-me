import { randomUUID } from 'crypto';
import { DomainError } from '@/domain/shared/domain.error';
import { MovimentacaoEstoque, TipoMovimentacao, MotivoMovimentacao } from '@/domain/inventario/movimentacao-estoque.entity';
import { EstoqueSetor } from '@/domain/inventario/estoque-setor.entity';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { PrismaEstoqueSetorRepository } from '@infrastructure/repositories/prisma-estoque-setor.repository';

export interface DestinarItemSetorInput {
  numeroInventario: string;
  setor: string;
  quantidade: number;
  realizadoPor: string;
  observacoes?: string;
}

export interface DestinarItemSetorOutput {
  item: { id: string; numero: string; nome: string; estoqueAtual: number };
  estoqueSetor: EstoqueSetor;
  movimentacao: MovimentacaoEstoque;
}

export class DestinarItemSetorUseCase {
  constructor(
    private readonly itemRepo: PrismaItemInventarioRepository,
    private readonly estoqueSetorRepo: PrismaEstoqueSetorRepository,
  ) {}

  async execute(input: DestinarItemSetorInput): Promise<DestinarItemSetorOutput> {
    if (!input.setor || input.setor.trim().length === 0) {
      throw new DomainError('Setor é obrigatório');
    }
    if (!Number.isInteger(input.quantidade) || input.quantidade <= 0) {
      throw new DomainError('Quantidade deve ser um inteiro positivo');
    }

    const item = await this.itemRepo.buscarPorNumero(input.numeroInventario);
    if (!item) {
      throw new DomainError(`Item "${input.numeroInventario}" não encontrado`);
    }
    if (item.estoqueAtual === 0) {
      throw new DomainError(`Item "${input.numeroInventario}" não possui estoque disponível`);
    }

    const itemAtualizado = item.registrarSaida(input.quantidade);

    const movimentacao = MovimentacaoEstoque.create({
      id: randomUUID(),
      itemId: item.id,
      tipo: TipoMovimentacao.SAIDA,
      motivo: MotivoMovimentacao.DESTINACAO,
      quantidade: input.quantidade,
      estoqueBefore: item.estoqueAtual,
      estoqueAfter: itemAtualizado.estoqueAtual,
      realizadoPor: input.realizadoPor,
      observacoes: input.observacoes,
      setorDestinoId: input.setor,
      setorDestinoNome: input.setor,
      criadoEm: new Date(),
    });

    const [itemSalvo, estoqueSetor] = await Promise.all([
      this.itemRepo.atualizar(itemAtualizado),
      this.estoqueSetorRepo.upsert(item.id, input.setor.toUpperCase(), input.quantidade),
    ]);
    await this.itemRepo.registrarMovimentacao(movimentacao);

    return {
      item: { id: itemSalvo.id, numero: itemSalvo.numero, nome: itemSalvo.nome, estoqueAtual: itemSalvo.estoqueAtual },
      estoqueSetor,
      movimentacao,
    };
  }
}
