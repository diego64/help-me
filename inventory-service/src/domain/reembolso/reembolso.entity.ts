import { DomainError } from '../shared/domain.error';

export enum StatusReembolso {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
  PAGO = 'PAGO',
}

export interface ReembolsoProps {
  id: string;
  solicitadoPor: string;
  solicitacaoCompraId?: string | null;
  valor: number;
  descricao: string;
  urlComprovante?: string | null;
  status: StatusReembolso;
  nfe?: string | null;
  dataEmissao?: Date | null;
  cnpjFornecedor?: string | null;
  aprovadoPor?: string | null;
  aprovadoEm?: Date | null;
  rejeitadoPor?: string | null;
  rejeitadoEm?: Date | null;
  motivoRejeicao?: string | null;
  processadoPor?: string | null;
  processadoEm?: Date | null;
  observacoes?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Reembolso {
  readonly id: string;
  readonly solicitadoPor: string;
  readonly solicitacaoCompraId: string | null;
  readonly valor: number;
  readonly descricao: string;
  readonly urlComprovante: string | null;
  readonly status: StatusReembolso;
  readonly nfe: string | null;
  readonly dataEmissao: Date | null;
  readonly cnpjFornecedor: string | null;
  readonly aprovadoPor: string | null;
  readonly aprovadoEm: Date | null;
  readonly rejeitadoPor: string | null;
  readonly rejeitadoEm: Date | null;
  readonly motivoRejeicao: string | null;
  readonly processadoPor: string | null;
  readonly processadoEm: Date | null;
  readonly observacoes: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: ReembolsoProps) {
    this.id = props.id;
    this.solicitadoPor = props.solicitadoPor;
    this.solicitacaoCompraId = props.solicitacaoCompraId ?? null;
    this.valor = props.valor;
    this.descricao = props.descricao;
    this.urlComprovante = props.urlComprovante ?? null;
    this.status = props.status;
    this.nfe = props.nfe ?? null;
    this.dataEmissao = props.dataEmissao ?? null;
    this.cnpjFornecedor = props.cnpjFornecedor ?? null;
    this.aprovadoPor = props.aprovadoPor ?? null;
    this.aprovadoEm = props.aprovadoEm ?? null;
    this.rejeitadoPor = props.rejeitadoPor ?? null;
    this.rejeitadoEm = props.rejeitadoEm ?? null;
    this.motivoRejeicao = props.motivoRejeicao ?? null;
    this.processadoPor = props.processadoPor ?? null;
    this.processadoEm = props.processadoEm ?? null;
    this.observacoes = props.observacoes ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ReembolsoProps): Reembolso {
    if (!props.solicitadoPor) {
      throw new DomainError('Solicitante é obrigatório');
    }
    if (props.valor <= 0) {
      throw new DomainError('Valor do reembolso deve ser positivo');
    }
    if (!props.descricao || props.descricao.trim().length === 0) {
      throw new DomainError('Descrição do reembolso é obrigatória');
    }
    if (props.descricao.length > 512) {
      throw new DomainError('Descrição não pode exceder 512 caracteres');
    }
    return new Reembolso(props);
  }

  aprovar(aprovadoPor: string): Reembolso {
    if (this.status !== StatusReembolso.PENDENTE) {
      throw new DomainError(`Reembolso não pode ser aprovado no status "${this.status}"`);
    }
    return Reembolso.create({
      ...this,
      status: StatusReembolso.APROVADO,
      aprovadoPor,
      aprovadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  rejeitar(rejeitadoPor: string, motivoRejeicao: string): Reembolso {
    if (this.status !== StatusReembolso.PENDENTE) {
      throw new DomainError(`Reembolso não pode ser rejeitado no status "${this.status}"`);
    }
    if (!motivoRejeicao || motivoRejeicao.trim().length === 0) {
      throw new DomainError('Motivo da rejeição é obrigatório');
    }
    return Reembolso.create({
      ...this,
      status: StatusReembolso.REJEITADO,
      rejeitadoPor,
      rejeitadoEm: new Date(),
      motivoRejeicao,
      atualizadoEm: new Date(),
    });
  }

  pagar(processadoPor: string): Reembolso {
    if (this.status !== StatusReembolso.APROVADO) {
      throw new DomainError(`Reembolso não pode ser pago no status "${this.status}"`);
    }
    return Reembolso.create({
      ...this,
      status: StatusReembolso.PAGO,
      processadoPor,
      processadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  anexarComprovante(url: string): Reembolso {
    return Reembolso.create({
      ...this,
      urlComprovante: url,
      atualizadoEm: new Date(),
    });
  }
}
