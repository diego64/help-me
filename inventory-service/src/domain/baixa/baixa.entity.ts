import { DomainError } from '../shared/domain.error';

export enum StatusBaixa {
  PENDENTE = 'PENDENTE',
  APROVADO_TECNICO = 'APROVADO_TECNICO',
  APROVADO_GESTOR = 'APROVADO_GESTOR',
  CONCLUIDO = 'CONCLUIDO',
  REJEITADO = 'REJEITADO',
}

export interface BaixaProps {
  id: string;
  solicitadoPor: string;
  perfilSolicitante: string;
  status: StatusBaixa;
  justificativa: string;
  aprovadoTecnicoPor?: string | null;
  aprovadoTecnicoEm?: Date | null;
  aprovadoGestorPor?: string | null;
  aprovadoGestorEm?: Date | null;
  rejeitadoPor?: string | null;
  rejeitadoEm?: Date | null;
  motivoRejeicao?: string | null;
  executadoPor?: string | null;
  executadoEm?: Date | null;
  observacoes?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Baixa {
  readonly id: string;
  readonly solicitadoPor: string;
  readonly perfilSolicitante: string;
  readonly status: StatusBaixa;
  readonly justificativa: string;
  readonly aprovadoTecnicoPor: string | null;
  readonly aprovadoTecnicoEm: Date | null;
  readonly aprovadoGestorPor: string | null;
  readonly aprovadoGestorEm: Date | null;
  readonly rejeitadoPor: string | null;
  readonly rejeitadoEm: Date | null;
  readonly motivoRejeicao: string | null;
  readonly executadoPor: string | null;
  readonly executadoEm: Date | null;
  readonly observacoes: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: BaixaProps) {
    this.id = props.id;
    this.solicitadoPor = props.solicitadoPor;
    this.perfilSolicitante = props.perfilSolicitante;
    this.status = props.status;
    this.justificativa = props.justificativa;
    this.aprovadoTecnicoPor = props.aprovadoTecnicoPor ?? null;
    this.aprovadoTecnicoEm = props.aprovadoTecnicoEm ?? null;
    this.aprovadoGestorPor = props.aprovadoGestorPor ?? null;
    this.aprovadoGestorEm = props.aprovadoGestorEm ?? null;
    this.rejeitadoPor = props.rejeitadoPor ?? null;
    this.rejeitadoEm = props.rejeitadoEm ?? null;
    this.motivoRejeicao = props.motivoRejeicao ?? null;
    this.executadoPor = props.executadoPor ?? null;
    this.executadoEm = props.executadoEm ?? null;
    this.observacoes = props.observacoes ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: BaixaProps): Baixa {
    if (!props.solicitadoPor) {
      throw new DomainError('Solicitante é obrigatório');
    }
    if (!props.justificativa || props.justificativa.trim().length === 0) {
      throw new DomainError('Justificativa é obrigatória');
    }
    if (props.justificativa.length > 512) {
      throw new DomainError('Justificativa não pode exceder 512 caracteres');
    }
    return new Baixa(props);
  }

  aprovarTecnico(aprovadoPor: string): Baixa {
    if (this.status !== StatusBaixa.PENDENTE) {
      throw new DomainError(`Baixa não pode ser aprovada pelo técnico no status "${this.status}"`);
    }
    return Baixa.create({
      ...this,
      status: StatusBaixa.APROVADO_TECNICO,
      aprovadoTecnicoPor: aprovadoPor,
      aprovadoTecnicoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  aprovarGestor(aprovadoPor: string): Baixa {
    if (this.status !== StatusBaixa.APROVADO_TECNICO) {
      throw new DomainError(`Baixa não pode ser aprovada pelo gestor no status "${this.status}"`);
    }
    return Baixa.create({
      ...this,
      status: StatusBaixa.APROVADO_GESTOR,
      aprovadoGestorPor: aprovadoPor,
      aprovadoGestorEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  rejeitar(rejeitadoPor: string, motivoRejeicao: string): Baixa {
    const podeSerRejeitada =
      this.status === StatusBaixa.PENDENTE ||
      this.status === StatusBaixa.APROVADO_TECNICO;

    if (!podeSerRejeitada) {
      throw new DomainError(`Baixa não pode ser rejeitada no status "${this.status}"`);
    }
    if (!motivoRejeicao || motivoRejeicao.trim().length === 0) {
      throw new DomainError('Motivo da rejeição é obrigatório');
    }
    return Baixa.create({
      ...this,
      status: StatusBaixa.REJEITADO,
      rejeitadoPor,
      rejeitadoEm: new Date(),
      motivoRejeicao,
      atualizadoEm: new Date(),
    });
  }

  concluir(executadoPor: string): Baixa {
    if (this.status !== StatusBaixa.APROVADO_GESTOR) {
      throw new DomainError(`Baixa não pode ser concluída no status "${this.status}"`);
    }
    return Baixa.create({
      ...this,
      status: StatusBaixa.CONCLUIDO,
      executadoPor,
      executadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }
}
