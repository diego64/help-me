import { DomainError } from '../shared/domain.error';

export interface EstoqueSetorProps {
  id: string;
  itemInventarioId: string;
  setor: string;
  quantidade: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class EstoqueSetor {
  readonly id: string;
  readonly itemInventarioId: string;
  readonly setor: string;
  readonly quantidade: number;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: EstoqueSetorProps) {
    this.id = props.id;
    this.itemInventarioId = props.itemInventarioId;
    this.setor = props.setor;
    this.quantidade = props.quantidade;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: EstoqueSetorProps): EstoqueSetor {
    if (!props.itemInventarioId) {
      throw new DomainError('Item de inventário é obrigatório');
    }
    if (!props.setor || props.setor.trim().length === 0) {
      throw new DomainError('Setor é obrigatório');
    }
    if (props.quantidade < 0) {
      throw new DomainError('Quantidade do setor não pode ser negativa');
    }
    return new EstoqueSetor(props);
  }

  adicionar(quantidade: number): EstoqueSetor {
    if (quantidade <= 0) throw new DomainError('Quantidade deve ser positiva');
    return EstoqueSetor.create({ ...this, quantidade: this.quantidade + quantidade, atualizadoEm: new Date() });
  }
}
