import {
  Prisma,
  UnidadeMedida as PrismaUnidadeMedida,
  MotivoMovimentacao as PrismaMotivoMovimentacao,
  TipoMovimentacao as PrismaTipoMovimentacao
} from '@prisma/client';
import { ItemInventario } from '../../domain/inventario/item-inventario.entity';
import { UnidadeMedida } from '../../domain/inventario/unidade-medida.enum';
import { MovimentacaoEstoque, MotivoMovimentacao, TipoMovimentacao } from '../../domain/inventario/movimentacao-estoque.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

// Tipos gerados pelo Prisma — sempre em sync com o schema
type ItemInventarioRecord = Prisma.ItemInventarioGetPayload<Record<string, never>>;
type MovimentacaoRecord = Prisma.MovimentacaoEstoqueGetPayload<Record<string, never>>;

type FiltrosItem = {
  nome?: string;
  categoriaId?: string;
  estoqueCritico?: boolean;
  pagina?: number;
  limite?: number;
};

export class PrismaItemInventarioRepository {
  async criar(item: ItemInventario): Promise<ItemInventario> {
    try {
      const record = await prisma.itemInventario.create({
        data: {
          id: item.id,
          numero: item.numero,
          nome: item.nome,
          sku: item.sku,
          descricao: item.descricao,
          unidade: item.unidade as unknown as PrismaUnidadeMedida,
          estoqueAtual: item.estoqueAtual,
          estoqueMinimo: item.estoqueMinimo,
          categoriaId: item.categoriaId,
          ocNumero: item.ocNumero,
          criadoPor: item.criadoPor,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao criar item de inventário', 'ITEM_CREATE_ERROR', error as Error);
    }
  }

  async buscarPorId(id: string): Promise<ItemInventario | null> {
    try {
      const record = await prisma.itemInventario.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar item por ID', 'ITEM_FIND_ERROR', error as Error);
    }
  }

  async buscarPorSku(sku: string): Promise<ItemInventario | null> {
    try {
      const record = await prisma.itemInventario.findUnique({ where: { sku } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar item por SKU', 'ITEM_FIND_ERROR', error as Error);
    }
  }

  async listar(filtros?: FiltrosItem): Promise<ItemInventario[]> {
    const limite = filtros?.limite ?? 50;
    const offset = ((filtros?.pagina ?? 1) - 1) * limite;

    try {
      if (filtros?.estoqueCritico) {
        const categoriaFilter = filtros.categoriaId
          ? Prisma.sql`AND "categoriaId" = ${filtros.categoriaId}`
          : Prisma.empty;
        const nomeFilter = filtros.nome
          ? Prisma.sql`AND lower(nome) LIKE ${'%' + filtros.nome.toLowerCase() + '%'}`
          : Prisma.empty;

        const records = await prisma.$queryRaw<ItemInventarioRecord[]>`
          SELECT id, numero, nome, sku, descricao, unidade, "estoqueAtual", "estoqueMinimo", "categoriaId", "ocNumero", "criadoPor", "criadoEm", "atualizadoEm"
          FROM "ItemInventario"
          WHERE "estoqueAtual" > 0
            AND "estoqueAtual" <= "estoqueMinimo"
          ${categoriaFilter}
          ${nomeFilter}
          ORDER BY nome ASC
          LIMIT ${limite} OFFSET ${offset}
        `;
        return records.map((r) => this.toDomain(r));
      }

      const records = await prisma.itemInventario.findMany({
        where: {
          estoqueAtual: { gt: 0 },
          ...(filtros?.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
          ...(filtros?.nome ? { nome: { contains: filtros.nome, mode: 'insensitive' } } : {}),
        },
        orderBy: { nome: 'asc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar itens de inventário', 'ITEM_LIST_ERROR', error as Error);
    }
  }

  async atualizar(item: ItemInventario): Promise<ItemInventario> {
    try {
      const record = await prisma.itemInventario.update({
        where: { id: item.id },
        data: {
          nome: item.nome,
          descricao: item.descricao,
          unidade: item.unidade as unknown as PrismaUnidadeMedida,
          estoqueAtual: item.estoqueAtual,
          estoqueMinimo: item.estoqueMinimo,
          categoriaId: item.categoriaId,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar item de inventário', 'ITEM_UPDATE_ERROR', error as Error);
    }
  }

  async registrarMovimentacao(movimentacao: MovimentacaoEstoque): Promise<MovimentacaoEstoque> {
    try {
      const record = await prisma.movimentacaoEstoque.create({
        data: {
          id: movimentacao.id,
          itemId: movimentacao.itemId,
          tipo: movimentacao.tipo as PrismaTipoMovimentacao,
          motivo: movimentacao.motivo as PrismaMotivoMovimentacao,
          quantidade: movimentacao.quantidade,
          estoqueBefore: movimentacao.estoqueBefore,
          estoqueAfter: movimentacao.estoqueAfter,
          referenciaId: movimentacao.referenciaId,
          realizadoPor: movimentacao.realizadoPor,
          observacoes: movimentacao.observacoes,
          setorDestinoId: movimentacao.setorDestinoId,
          setorDestinoNome: movimentacao.setorDestinoNome,
        },
      });
      return this.movimentacaoToDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao registrar movimentação de estoque', 'MOVIMENTACAO_CREATE_ERROR', error as Error);
    }
  }

  async listarMovimentacoesPorItem(itemId: string): Promise<MovimentacaoEstoque[]> {
    try {
      const records = await prisma.movimentacaoEstoque.findMany({
        where: { itemId },
        orderBy: { criadoEm: 'desc' },
      });
      return records.map((r) => this.movimentacaoToDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar movimentações do item', 'MOVIMENTACAO_LIST_ERROR', error as Error);
    }
  }

  private mapTipo(tipo: MovimentacaoRecord['tipo']): TipoMovimentacao {
    const map: Record<MovimentacaoRecord['tipo'], TipoMovimentacao> = {
      ENTRADA: TipoMovimentacao.ENTRADA,
      SAIDA: TipoMovimentacao.SAIDA,
    };
    return map[tipo];
  }

  async buscarPorNumero(numero: string): Promise<ItemInventario | null> {
    try {
      const record = await prisma.itemInventario.findUnique({ where: { numero } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar item por número', 'ITEM_FIND_ERROR', error as Error);
    }
  }

  private mapMotivo(motivo: MovimentacaoRecord['motivo']): MotivoMovimentacao {
    const map: Record<MovimentacaoRecord['motivo'], MotivoMovimentacao> = {
      COMPRA: MotivoMovimentacao.COMPRA,
      ENTRADA_MANUAL: MotivoMovimentacao.ENTRADA_MANUAL,
      BAIXA: MotivoMovimentacao.BAIXA,
      AJUSTE: MotivoMovimentacao.AJUSTE,
      DESTINACAO: MotivoMovimentacao.DESTINACAO,
    };
    return map[motivo];
  }

  private toDomain(record: ItemInventarioRecord): ItemInventario {
    return ItemInventario.create({
      id: record.id,
      numero: record.numero,
      nome: record.nome,
      sku: record.sku,
      descricao: record.descricao,
      unidade: record.unidade as unknown as UnidadeMedida,
      estoqueAtual: record.estoqueAtual,
      estoqueMinimo: record.estoqueMinimo,
      categoriaId: record.categoriaId,
      ocNumero: record.ocNumero,
      criadoPor: record.criadoPor,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    });
  }

  private movimentacaoToDomain(record: MovimentacaoRecord): MovimentacaoEstoque {
    return MovimentacaoEstoque.create({
      id: record.id,
      itemId: record.itemId,
      tipo: this.mapTipo(record.tipo),
      motivo: this.mapMotivo(record.motivo),
      quantidade: record.quantidade,
      estoqueBefore: record.estoqueBefore,
      estoqueAfter: record.estoqueAfter,
      referenciaId: record.referenciaId,
      realizadoPor: record.realizadoPor,
      observacoes: record.observacoes,
      setorDestinoId: record.setorDestinoId,
      setorDestinoNome: record.setorDestinoNome,
      criadoEm: record.criadoEm,
    });
  }
}