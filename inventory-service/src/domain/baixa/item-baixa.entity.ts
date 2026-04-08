import { DomainError } from '../shared/domain.error';

export interface ItemBaixaProps {
  id: string;
  baixaId: string;
  itemInventarioId: string;
  quantidade: number;
  motivo?: string | null;
}

export class ItemBaixa {
  readonly id: string;
  readonly baixaId: string;
  readonly itemInventarioId: string;
  readonly quantidade: number;
  readonly motivo: string | null;

  private constructor(props: ItemBaixaProps) {
    this.id = props.id;
    this.baixaId = props.baixaId;
    this.itemInventarioId = props.itemInventarioId;
    this.quantidade = props.quantidade;
    this.motivo = props.motivo ?? null;
  }

  static create(props: ItemBaixaProps): ItemBaixa {
    if (!props.baixaId) {
      throw new DomainError('Baixa é obrigatória');
    }
    if (!props.itemInventarioId) {
      throw new DomainError('Item do inventário é obrigatório');
    }
    if (props.quantidade <= 0) {
      throw new DomainError('Quantidade deve ser positiva');
    }
    if (props.motivo && props.motivo.length > 255) {
      throw new DomainError('Motivo não pode exceder 255 caracteres');
    }
    return new ItemBaixa(props);
  }
}
