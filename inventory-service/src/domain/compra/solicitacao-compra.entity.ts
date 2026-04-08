import { DomainError } from '../shared/domain.error';

export enum StatusSolicitacaoCompra {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
  COMPRADO = 'COMPRADO',
  CANCELADO = 'CANCELADO',
}

export enum FormaPagamento {
  PIX = 'PIX',
  DEBITO = 'DEBITO',
  BOLETO = 'BOLETO',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
}

export interface SolicitacaoCompraProps {
  id: string;
  acNumero: string;
  ocNumero: string;
  solicitadoPor: string;
  setorSolicitante?: string | null;
  fornecedorId?: string | null;
  status: StatusSolicitacaoCompra;
  justificativa?: string | null;
  formaPagamento?: FormaPagamento | null;
  parcelas?: number | null;
  aprovadoPor?: string | null;
  aprovadoEm?: Date | null;
  rejeitadoPor?: string | null;
  rejeitadoEm?: Date | null;
  motivoRejeicao?: string | null;
  executadoPor?: string | null;
  executadoEm?: Date | null;
  valorTotal?: number | null;
  observacoes?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class SolicitacaoCompra {
  readonly id: string;
  readonly acNumero: string;
  readonly ocNumero: string;
  readonly solicitadoPor: string;
  readonly setorSolicitante: string | null;
  readonly fornecedorId: string | null;
  readonly status: StatusSolicitacaoCompra;
  readonly justificativa: string | null;
  readonly formaPagamento: FormaPagamento | null;
  readonly parcelas: number | null;
  readonly aprovadoPor: string | null;
  readonly aprovadoEm: Date | null;
  readonly rejeitadoPor: string | null;
  readonly rejeitadoEm: Date | null;
  readonly motivoRejeicao: string | null;
  readonly executadoPor: string | null;
  readonly executadoEm: Date | null;
  readonly valorTotal: number | null;
  readonly observacoes: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: SolicitacaoCompraProps) {
    this.id = props.id;
    this.acNumero = props.acNumero;
    this.ocNumero = props.ocNumero;
    this.solicitadoPor = props.solicitadoPor;
    this.setorSolicitante = props.setorSolicitante ?? null;
    this.fornecedorId = props.fornecedorId ?? null;
    this.status = props.status;
    this.justificativa = props.justificativa ?? null;
    this.formaPagamento = props.formaPagamento ?? null;
    this.parcelas = props.parcelas ?? null;
    this.aprovadoPor = props.aprovadoPor ?? null;
    this.aprovadoEm = props.aprovadoEm ?? null;
    this.rejeitadoPor = props.rejeitadoPor ?? null;
    this.rejeitadoEm = props.rejeitadoEm ?? null;
    this.motivoRejeicao = props.motivoRejeicao ?? null;
    this.executadoPor = props.executadoPor ?? null;
    this.executadoEm = props.executadoEm ?? null;
    this.valorTotal = props.valorTotal ?? null;
    this.observacoes = props.observacoes ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: SolicitacaoCompraProps): SolicitacaoCompra {
    if (!props.acNumero || !props.ocNumero) {
      throw new DomainError('Números AC e OC são obrigatórios');
    }
    if (!props.solicitadoPor) {
      throw new DomainError('Solicitante é obrigatório');
    }
    if (props.valorTotal !== undefined && props.valorTotal !== null && props.valorTotal < 0) {
      throw new DomainError('Valor total não pode ser negativo');
    }
    return new SolicitacaoCompra(props);
  }

  aprovar(aprovadoPor: string, formaPagamento: FormaPagamento, parcelas: number): SolicitacaoCompra {
    if (this.status !== StatusSolicitacaoCompra.PENDENTE) {
      throw new DomainError(`Solicitação não pode ser aprovada no status "${this.status}"`);
    }
    if (formaPagamento === FormaPagamento.CARTAO_CREDITO && parcelas < 1) {
      throw new DomainError('Cartão de Crédito requer ao menos 1 parcela');
    }
    return SolicitacaoCompra.create({
      ...this,
      status: StatusSolicitacaoCompra.APROVADO,
      formaPagamento,
      parcelas,
      aprovadoPor,
      aprovadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  rejeitar(rejeitadoPor: string, motivoRejeicao: string): SolicitacaoCompra {
    if (this.status !== StatusSolicitacaoCompra.PENDENTE) {
      throw new DomainError(`Solicitação não pode ser rejeitada no status "${this.status}"`);
    }
    if (!motivoRejeicao || motivoRejeicao.trim().length === 0) {
      throw new DomainError('Motivo da rejeição é obrigatório');
    }
    return SolicitacaoCompra.create({
      ...this,
      status: StatusSolicitacaoCompra.REJEITADO,
      rejeitadoPor,
      rejeitadoEm: new Date(),
      motivoRejeicao,
      atualizadoEm: new Date(),
    });
  }

  marcarComoComprado(executadoPor: string, valorTotal?: number): SolicitacaoCompra {
    if (this.status !== StatusSolicitacaoCompra.APROVADO) {
      throw new DomainError(`Solicitação não pode ser marcada como comprada no status "${this.status}"`);
    }
    return SolicitacaoCompra.create({
      ...this,
      status: StatusSolicitacaoCompra.COMPRADO,
      executadoPor,
      executadoEm: new Date(),
      valorTotal: valorTotal ?? this.valorTotal,
      atualizadoEm: new Date(),
    });
  }

  cancelar(): SolicitacaoCompra {
    const podeSerCancelada =
      this.status === StatusSolicitacaoCompra.PENDENTE ||
      this.status === StatusSolicitacaoCompra.APROVADO;

    if (!podeSerCancelada) {
      throw new DomainError(`Solicitação não pode ser cancelada no status "${this.status}"`);
    }
    return SolicitacaoCompra.create({
      ...this,
      status: StatusSolicitacaoCompra.CANCELADO,
      atualizadoEm: new Date(),
    });
  }
}
