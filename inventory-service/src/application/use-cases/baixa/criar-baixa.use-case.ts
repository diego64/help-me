import { randomUUID } from 'crypto';
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity';
import { ItemBaixa } from '@/domain/baixa/item-baixa.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { publicarBaixaCriada } from '@messaging/producers/baixa.producer';

export interface ItemBaixaInput {
  numeroInventario: string;
  quantidade: number;
  motivo?: string;
}

export interface CriarBaixaInput {
  solicitadoPor: string;
  perfilSolicitante: string;
  justificativa: string;
  observacoes?: string;
  itens: ItemBaixaInput[];
}

export class CriarBaixaUseCase {
  constructor(
    private readonly baixaRepo: PrismaBaixaRepository,
    private readonly itemRepo: PrismaItemInventarioRepository,
  ) {}

  async execute(input: CriarBaixaInput): Promise<Baixa> {
    if (!input.itens || input.itens.length === 0) {
      throw new DomainError('A baixa deve conter ao menos um item');
    }

    const itensInventario = await Promise.all(
      input.itens.map((i) => this.itemRepo.buscarPorNumero(i.numeroInventario)),
    );

    for (let idx = 0; idx < itensInventario.length; idx++) {
      const itemEncontrado = itensInventario[idx];
      const itemInput = input.itens[idx]!;
      if (!itemEncontrado) {
        throw new DomainError(`Item de inventário "${itemInput.numeroInventario}" não encontrado`);
      }
      if (itemEncontrado.estoqueAtual === 0) {
        throw new DomainError(
          `Item "${itemInput.numeroInventario}" não possui estoque disponível — pode ter sido baixado ou destinado a um setor`,
        );
      }
    }

    const agora = new Date();
    const baixaId = randomUUID();

    const baixa = Baixa.create({
      id: baixaId,
      solicitadoPor: input.solicitadoPor,
      perfilSolicitante: input.perfilSolicitante,
      status: StatusBaixa.PENDENTE,
      justificativa: input.justificativa,
      observacoes: input.observacoes ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    const itens = input.itens.map((i, idx) =>
      ItemBaixa.create({
        id: randomUUID(),
        baixaId,
        itemInventarioId: itensInventario[idx]!.id,
        quantidade: i.quantidade,
        motivo: i.motivo ?? null,
      }),
    );

    const criada = await this.baixaRepo.criar(baixa, itens);
    await publicarBaixaCriada(criada, itens);

    return criada;
  }
}
