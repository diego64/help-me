import { randomUUID } from 'crypto';
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { ItemSolicitacaoCompra } from '@/domain/compra/item-solicitacao-compra.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { publicarCompraCriada } from '@messaging/producers/compra.producer';
import { proximoNumero } from '@infrastructure/database/numero-sequencial';

export interface ItemSolicitacaoInput {
  itemInventarioId?: string;
  nomeProduto: string;
  quantidade: number;
  precoEstimado?: number;
}

export interface CriarSolicitacaoCompraInput {
  solicitadoPor: string;
  setorSolicitante?: string | null;
  fornecedorId?: string;
  justificativa?: string;
  observacoes?: string;
  itens: ItemSolicitacaoInput[];
}

export class CriarSolicitacaoCompraUseCase {
  constructor(private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository) {}

  async execute(input: CriarSolicitacaoCompraInput): Promise<SolicitacaoCompra> {
    if (!input.itens || input.itens.length === 0) {
      throw new DomainError('A solicitação deve conter ao menos um item');
    }

    const agora = new Date();
    const solicitacaoId = randomUUID();

    const [acNumero, ocNumero] = await Promise.all([
      proximoNumero('AC'),
      proximoNumero('OC'),
    ]);

    const solicitacao = SolicitacaoCompra.create({
      id: solicitacaoId,
      acNumero,
      ocNumero,
      solicitadoPor: input.solicitadoPor,
      setorSolicitante: input.setorSolicitante ?? null,
      fornecedorId: input.fornecedorId ?? null,
      status: StatusSolicitacaoCompra.PENDENTE,
      justificativa: input.justificativa ?? null,
      observacoes: input.observacoes ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    const itens = input.itens.map((i) =>
      ItemSolicitacaoCompra.create({
        id: randomUUID(),
        solicitacaoCompraId: solicitacaoId,
        itemInventarioId: i.itemInventarioId,
        nomeProduto: i.nomeProduto,
        quantidade: i.quantidade,
        precoEstimado: i.precoEstimado ?? null,
      }),
    );

    const criada = await this.solicitacaoRepo.criar(solicitacao, itens);
    await publicarCompraCriada(criada, itens);

    return criada;
  }
}
