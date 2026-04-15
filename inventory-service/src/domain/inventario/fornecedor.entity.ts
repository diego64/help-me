import { DomainError } from '../shared/domain.error';

export interface FornecedorProps {
  id: string;
  nome: string;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Fornecedor {
  readonly id: string;
  readonly nome: string;
  readonly cnpj: string | null;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: FornecedorProps) {
    this.id = props.id;
    this.nome = props.nome;
    this.cnpj = props.cnpj ?? null;
    this.email = props.email ?? null;
    this.telefone = props.telefone ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: FornecedorProps): Fornecedor {
    if (!props.nome || props.nome.trim().length === 0) {
      throw new DomainError('Nome do fornecedor é obrigatório');
    }
    if (props.nome.length > 100) {
      throw new DomainError('Nome do fornecedor não pode exceder 100 caracteres');
    }
    if (props.cnpj && !Fornecedor.cnpjValido(props.cnpj)) {
      throw new DomainError('CNPJ inválido');
    }
    if (props.email && !Fornecedor.emailValido(props.email)) {
      throw new DomainError('E-mail do fornecedor inválido');
    }
    return new Fornecedor(props);
  }

  atualizar(dados: Partial<Pick<FornecedorProps, 'nome' | 'cnpj' | 'email' | 'telefone'>>): Fornecedor {
    return Fornecedor.create({
      ...this,
      ...dados,
      atualizadoEm: new Date(),
    });
  }

  private static cnpjValido(cnpj: string): boolean {
    const apenas = cnpj.replace(/\D/g, '');
    return apenas.length === 14;
  }

  private static emailValido(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
