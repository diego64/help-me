import { randomUUID } from 'crypto';
import { Baixa } from '@/domain/baixa/baixa.entity';
import { MovimentacaoEstoque, TipoMovimentacao, MotivoMovimentacao } from '@/domain/inventario/movimentacao-estoque.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { publicarBaixaConcluida } from '@messaging/producers/baixa.producer';

export interface ExecutarBaixaInput {
  id: string;
  executadoPor: string;
}

export class ExecutarBaixaUseCase {
  constructor(
    private readonly baixaRepo: PrismaBaixaRepository,
    private readonly itemRepo: PrismaItemInventarioRepository,
  ) {}

  async execute(input: ExecutarBaixaInput): Promise<Baixa> {
    const [baixa, itensBaixa] = await Promise.all([
      this.baixaRepo.buscarPorId(input.id),
      this.baixaRepo.listarItensDaBaixa(input.id),
    ]);

    if (!baixa) {
      throw new DomainError(`Baixa "${input.id}" não encontrada`);
    }

    if (itensBaixa.length === 0) {
      throw new DomainError(`Baixa "${input.id}" não possui itens — não pode ser concluída`);
    }

    // Fase 1 — validação: resolve todos os itens antes de persistir qualquer coisa
    const itensInventario = await Promise.all(
      itensBaixa.map((i) => this.itemRepo.buscarPorId(i.itemInventarioId)),
    );

    for (let idx = 0; idx < itensBaixa.length; idx++) {
      const itemBaixa = itensBaixa[idx]!;
      const itemInventario = itensInventario[idx];

      if (!itemInventario) {
        throw new DomainError(
          `Item de inventário vinculado ao item de baixa "${itemBaixa.id}" não encontrado — recrie a solicitação de baixa`,
        );
      }

      if (itemBaixa.quantidade > itemInventario.estoqueAtual) {
        throw new DomainError(
          `Item "${itemInventario.numero}" possui estoque ${itemInventario.estoqueAtual} mas a baixa solicita ${itemBaixa.quantidade}`,
        );
      }
    }

    // Fase 2 — domínio: calcula saídas e movimentações (sem I/O)
    const concluida = baixa.concluir(input.executadoPor);
    const agora = new Date();

    const atualizacoes = itensBaixa.map((itemBaixa, idx) => {
      const itemInventario = itensInventario[idx]!;
      const itemAtualizado = itemInventario.registrarSaida(itemBaixa.quantidade);
      const movimentacao = MovimentacaoEstoque.create({
        id: randomUUID(),
        itemId: itemInventario.id,
        tipo: TipoMovimentacao.SAIDA,
        motivo: MotivoMovimentacao.BAIXA,
        quantidade: itemBaixa.quantidade,
        estoqueBefore: itemInventario.estoqueAtual,
        estoqueAfter: itemAtualizado.estoqueAtual,
        referenciaId: baixa.id,
        realizadoPor: input.executadoPor,
        criadoEm: agora,
      });
      return { itemAtualizado, movimentacao };
    });

    // Fase 3 — persistência: só executa após todas as validações passarem
    await Promise.all(
      atualizacoes.flatMap(({ itemAtualizado, movimentacao }) => [
        this.itemRepo.atualizar(itemAtualizado),
        this.itemRepo.registrarMovimentacao(movimentacao),
      ]),
    );

    const atualizada = await this.baixaRepo.atualizar(concluida);
    await publicarBaixaConcluida(atualizada);

    return atualizada;
  }
}
