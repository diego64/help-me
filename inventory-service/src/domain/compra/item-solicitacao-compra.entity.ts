import { DomainError } from '../shared/domain.error';

export interface ItemSolicitacaoCompraProps {
  id: string;
  solicitacaoCompraId: string;
  itemInventarioId?: string | null;
  nomeProduto: string;
  quantidade: number;
  precoEstimado?: number | null;
  precoReal?: number | null;
}

export class ItemSolicitacaoCompra {
  readonly id: string;
  readonly solicitacaoCompraId: string;
  readonly itemInventarioId: string | null;
  readonly nomeProduto: string;
  readonly quantidade: number;
  readonly precoEstimado: number | null;
  readonly precoReal: number | null;

  private constructor(props: ItemSolicitacaoCompraProps) {
    this.id = props.id;
    this.solicitacaoCompraId = props.solicitacaoCompraId;
    this.itemInventarioId = props.itemInventarioId ?? null;
    this.nomeProduto = props.nomeProduto;
    this.quantidade = props.quantidade;
    this.precoEstimado = props.precoEstimado ?? null;
    this.precoReal = props.precoReal ?? null;
  }

  static create(props: ItemSolicitacaoCompraProps): ItemSolicitacaoCompra {
    if (!props.solicitacaoCompraId) {
      throw new DomainError('Solicitação de compra é obrigatória');
    }
    if (!props.nomeProduto?.trim()) {
      throw new DomainError('Nome do produto é obrigatório');
    }
    if (props.quantidade <= 0) {
      throw new DomainError('Quantidade deve ser positiva');
    }
    if (props.precoEstimado !== undefined && props.precoEstimado !== null && props.precoEstimado < 0) {
      throw new DomainError('Preço estimado não pode ser negativo');
    }
    if (props.precoReal !== undefined && props.precoReal !== null && props.precoReal < 0) {
      throw new DomainError('Preço real não pode ser negativo');
    }
    return new ItemSolicitacaoCompra(props);
  }

  get subtotalEstimado(): number | null {
    return this.precoEstimado !== null ? this.quantidade * this.precoEstimado : null;
  }

  get subtotalReal(): number | null {
    return this.precoReal !== null ? this.quantidade * this.precoReal : null;
  }

  registrarPrecoReal(preco: number): ItemSolicitacaoCompra {
    if (preco < 0) {
      throw new DomainError('Preço real não pode ser negativo');
    }
    return ItemSolicitacaoCompra.create({ ...this, precoReal: preco });
  }
}
