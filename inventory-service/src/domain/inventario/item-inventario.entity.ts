import { DomainError } from '../shared/domain.error';
import { UnidadeMedida } from './unidade-medida.enum';

export { UnidadeMedida };

export interface ItemInventarioProps {
  id: string;
  numero: string;
  nome: string;
  sku: string;
  descricao?: string | null;
  unidade: UnidadeMedida;
  estoqueAtual: number;
  estoqueMinimo: number;
  categoriaId: string;
  ocNumero?: string | null;
  criadoPor: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class ItemInventario {
  readonly id: string;
  readonly numero: string;
  readonly nome: string;
  readonly sku: string;
  readonly descricao: string | null;
  readonly unidade: UnidadeMedida;
  readonly estoqueAtual: number;
  readonly estoqueMinimo: number;
  readonly categoriaId: string;
  readonly ocNumero: string | null;
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  private constructor(props: ItemInventarioProps) {
    this.id = props.id;
    this.numero = props.numero;
    this.nome = props.nome;
    this.sku = props.sku;
    this.descricao = props.descricao ?? null;
    this.unidade = props.unidade;
    this.estoqueAtual = props.estoqueAtual;
    this.estoqueMinimo = props.estoqueMinimo;
    this.categoriaId = props.categoriaId;
    this.ocNumero = props.ocNumero ?? null;
    this.criadoPor = props.criadoPor;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ItemInventarioProps): ItemInventario {
    if (!props.numero || props.numero.trim().length === 0) {
      throw new DomainError('Número do item é obrigatório');
    }
    if (!props.nome || props.nome.trim().length === 0) {
      throw new DomainError('Nome do item é obrigatório');
    }
    if (!props.sku || props.sku.trim().length === 0) {
      throw new DomainError('SKU do item é obrigatório');
    }
    if (!props.unidade || props.unidade.trim().length === 0) {
      throw new DomainError('Unidade do item é obrigatória');
    }
    if (props.estoqueAtual < 0) {
      throw new DomainError('Estoque atual não pode ser negativo');
    }
    if (props.estoqueMinimo < 0) {
      throw new DomainError('Estoque mínimo não pode ser negativo');
    }
    if (!props.categoriaId) {
      throw new DomainError('Categoria é obrigatória');
    }
    if (!props.criadoPor) {
      throw new DomainError('Responsável pela criação é obrigatório');
    }
    return new ItemInventario(props);
  }

  get estoqueCritico(): boolean {
    return this.estoqueAtual <= this.estoqueMinimo;
  }

  get semEstoque(): boolean {
    return this.estoqueAtual === 0;
  }

  registrarEntrada(quantidade: number): ItemInventario {
    if (quantidade <= 0) {
      throw new DomainError('Quantidade de entrada deve ser positiva');
    }
    return ItemInventario.create({
      ...this,
      estoqueAtual: this.estoqueAtual + quantidade,
      atualizadoEm: new Date(),
    });
  }

  registrarSaida(quantidade: number): ItemInventario {
    if (quantidade <= 0) {
      throw new DomainError('Quantidade de saída deve ser positiva');
    }
    if (quantidade > this.estoqueAtual) {
      throw new DomainError('Quantidade de saída excede o estoque disponível');
    }
    return ItemInventario.create({
      ...this,
      estoqueAtual: this.estoqueAtual - quantidade,
      atualizadoEm: new Date(),
    });
  }

  atualizar(
    dados: Partial<Pick<ItemInventarioProps, 'nome' | 'descricao' | 'unidade' | 'estoqueMinimo' | 'categoriaId'>>,
  ): ItemInventario {
    const definidos = Object.fromEntries(
      Object.entries(dados).filter(([, v]) => v !== undefined),
    ) as typeof dados;
    return ItemInventario.create({
      ...this,
      ...definidos,
      atualizadoEm: new Date(),
    });
  }
}
