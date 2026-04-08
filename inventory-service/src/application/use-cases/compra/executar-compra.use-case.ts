import { randomUUID } from 'crypto';
import { SolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { MovimentacaoEstoque, TipoMovimentacao, MotivoMovimentacao } from '@/domain/inventario/movimentacao-estoque.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { publicarCompraExecutada } from '@messaging/producers/compra.producer';

export interface ExecutarCompraInput {
  id: string;
  executadoPor: string;
  valorTotal?: number;
}

export class ExecutarCompraUseCase {
  constructor(
    private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository,
    private readonly itemRepo: PrismaItemInventarioRepository,
  ) {}

  async execute(input: ExecutarCompraInput): Promise<SolicitacaoCompra> {
    const [solicitacao, itens] = await Promise.all([
      this.solicitacaoRepo.buscarPorId(input.id),
      this.solicitacaoRepo.listarItensDaSolicitacao(input.id),
    ]);

    if (!solicitacao) {
      throw new DomainError(`Solicitação de compra "${input.id}" não encontrada`);
    }

    const somaEstimada = itens.reduce((acc, i) => acc + (i.precoEstimado ?? 0) * i.quantidade, 0);
    const valorFinal = input.valorTotal ?? (somaEstimada > 0 ? somaEstimada : undefined);

    const comprada = solicitacao.marcarComoComprado(input.executadoPor, valorFinal);

    const itensVinculados = itens.filter((i) => i.itemInventarioId !== null);

    const itensInventario = await Promise.all(
      itensVinculados.map((i) => this.itemRepo.buscarPorId(i.itemInventarioId!)),
    );

    for (let idx = 0; idx < itensInventario.length; idx++) {
      const itemInventario = itensInventario[idx];
      const itemSolicitacao = itensVinculados[idx];

      if (!itemInventario || !itemSolicitacao) continue;

      const itemAtualizado = itemInventario.registrarEntrada(itemSolicitacao.quantidade);

      const movimentacao = MovimentacaoEstoque.create({
        id: randomUUID(),
        itemId: itemInventario.id,
        tipo: TipoMovimentacao.ENTRADA,
        motivo: MotivoMovimentacao.COMPRA,
        quantidade: itemSolicitacao.quantidade,
        estoqueBefore: itemInventario.estoqueAtual,
        estoqueAfter: itemAtualizado.estoqueAtual,
        referenciaId: solicitacao.id,
        realizadoPor: input.executadoPor,
        criadoEm: new Date(),
      });

      await Promise.all([
        this.itemRepo.atualizar(itemAtualizado),
        this.itemRepo.registrarMovimentacao(movimentacao),
      ]);
    }

    const atualizada = await this.solicitacaoRepo.atualizar(comprada);
    await publicarCompraExecutada(atualizada);

    return atualizada;
  }
}
