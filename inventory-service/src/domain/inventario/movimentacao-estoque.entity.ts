import { DomainError } from '../shared/domain.error';

export enum TipoMovimentacao {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
}

export enum MotivoMovimentacao {
  COMPRA = 'COMPRA',
  ENTRADA_MANUAL = 'ENTRADA_MANUAL',
  BAIXA = 'BAIXA',
  AJUSTE = 'AJUSTE',
  DESTINACAO = 'DESTINACAO',
}

export interface MovimentacaoEstoqueProps {
  id: string;
  itemId: string;
  tipo: TipoMovimentacao;
  motivo: MotivoMovimentacao;
  quantidade: number;
  estoqueBefore: number;
  estoqueAfter: number;
  referenciaId?: string | null;
  realizadoPor: string;
  observacoes?: string | null;
  setorDestinoId?: string | null;
  setorDestinoNome?: string | null;
  criadoEm: Date;
}

export class MovimentacaoEstoque {
  readonly id: string;
  readonly itemId: string;
  readonly tipo: TipoMovimentacao;
  readonly motivo: MotivoMovimentacao;
  readonly quantidade: number;
  readonly estoqueBefore: number;
  readonly estoqueAfter: number;
  readonly referenciaId: string | null;
  readonly realizadoPor: string;
  readonly observacoes: string | null;
  readonly setorDestinoId: string | null;
  readonly setorDestinoNome: string | null;
  readonly criadoEm: Date;

  private constructor(props: MovimentacaoEstoqueProps) {
    this.id = props.id;
    this.itemId = props.itemId;
    this.tipo = props.tipo;
    this.motivo = props.motivo;
    this.quantidade = props.quantidade;
    this.estoqueBefore = props.estoqueBefore;
    this.estoqueAfter = props.estoqueAfter;
    this.referenciaId = props.referenciaId ?? null;
    this.realizadoPor = props.realizadoPor;
    this.observacoes = props.observacoes ?? null;
    this.setorDestinoId = props.setorDestinoId ?? null;
    this.setorDestinoNome = props.setorDestinoNome ?? null;
    this.criadoEm = props.criadoEm;
  }

  static create(props: MovimentacaoEstoqueProps): MovimentacaoEstoque {
    if (!props.itemId) {
      throw new DomainError('Item é obrigatório na movimentação');
    }
    if (props.quantidade <= 0) {
      throw new DomainError('Quantidade da movimentação deve ser positiva');
    }
    if (props.estoqueBefore < 0) {
      throw new DomainError('Estoque anterior não pode ser negativo');
    }
    if (props.estoqueAfter < 0) {
      throw new DomainError('Estoque posterior não pode ser negativo');
    }
    if (!props.realizadoPor) {
      throw new DomainError('Responsável pela movimentação é obrigatório');
    }

    const diferencaEsperada =
      props.tipo === TipoMovimentacao.ENTRADA
        ? props.estoqueBefore + props.quantidade
        : props.estoqueBefore - props.quantidade;

    if (diferencaEsperada !== props.estoqueAfter) {
      throw new DomainError('Inconsistência entre quantidade e saldos de estoque');
    }

    return new MovimentacaoEstoque(props);
  }
}
