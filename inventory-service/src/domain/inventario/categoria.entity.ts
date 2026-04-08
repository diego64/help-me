import { DomainError } from '../shared/domain.error';

export interface CategoriaProps {
  id: string;
  nome: string;
  descricao?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Categoria {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: CategoriaProps) {
    this.id = props.id;
    this.nome = props.nome;
    this.descricao = props.descricao ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: CategoriaProps): Categoria {
    if (!props.nome || props.nome.trim().length === 0) {
      throw new DomainError('Nome da categoria é obrigatório');
    }
    if (props.nome.length > 100) {
      throw new DomainError('Nome da categoria não pode exceder 100 caracteres');
    }
    if (props.descricao && props.descricao.length > 512) {
      throw new DomainError('Descrição da categoria não pode exceder 512 caracteres');
    }
    return new Categoria(props);
  }

  atualizar(dados: Partial<Pick<CategoriaProps, 'nome' | 'descricao'>>): Categoria {
    return Categoria.create({
      ...this,
      ...dados,
      atualizadoEm: new Date(),
    });
  }
}
