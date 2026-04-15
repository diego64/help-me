import { Prisma, StatusSolicitacaoCompra as PrismaStatusSolicitacaoCompra, FormaPagamento as PrismaFormaPagamento } from '@prisma/client';
import { SolicitacaoCompra, SolicitacaoCompraProps, StatusSolicitacaoCompra, FormaPagamento } from '../../domain/compra/solicitacao-compra.entity';
import { ItemSolicitacaoCompra, ItemSolicitacaoCompraProps } from '../../domain/compra/item-solicitacao-compra.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

// Tipos gerados pelo Prisma — sempre em sync com o schema
type SolicitacaoCompraRecord = Prisma.SolicitacaoCompraGetPayload<Record<string, never>>;
type ItemSolicitacaoCompraRecord = Prisma.ItemSolicitacaoCompraGetPayload<Record<string, never>>;

type FiltrosSolicitacao = {
  status?: StatusSolicitacaoCompra;
  solicitadoPor?: string;
  pagina?: number;
  limite?: number;
};

export class PrismaSolicitacaoCompraRepository {
  async criar(
    solicitacao: SolicitacaoCompra,
    itens: ItemSolicitacaoCompra[],
  ): Promise<SolicitacaoCompra> {
    try {
      const record = await prisma.solicitacaoCompra.create({
        data: {
          id: solicitacao.id,
          acNumero: solicitacao.acNumero,
          ocNumero: solicitacao.ocNumero,
          solicitadoPor: solicitacao.solicitadoPor,
          setorSolicitante: solicitacao.setorSolicitante,
          fornecedorId: solicitacao.fornecedorId,
          status: solicitacao.status as PrismaStatusSolicitacaoCompra,
          justificativa: solicitacao.justificativa,
          valorTotal: solicitacao.valorTotal,
          observacoes: solicitacao.observacoes,
          itens: {
            create: itens.map((item) => ({
              id: item.id,
              itemInventarioId: item.itemInventarioId,
              nomeProduto: item.nomeProduto,
              quantidade: item.quantidade,
              precoEstimado: item.precoEstimado,
              precoReal: item.precoReal,
            })),
          },
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError(
        'Erro ao criar solicitação de compra',
        'SOLICITACAO_CREATE_ERROR',
        error as Error,
      );
    }
  }

  async buscarPorId(id: string): Promise<SolicitacaoCompra | null> {
    try {
      const record = await prisma.solicitacaoCompra.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError(
        'Erro ao buscar solicitação de compra por ID',
        'SOLICITACAO_FIND_ERROR',
        error as Error,
      );
    }
  }

  async buscarPorOcNumero(ocNumero: string): Promise<SolicitacaoCompra | null> {
    try {
      const record = await prisma.solicitacaoCompra.findUnique({ where: { ocNumero } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError(
        'Erro ao buscar solicitação de compra por O.C',
        'SOLICITACAO_FIND_ERROR',
        error as Error,
      );
    }
  }

  async listarItensDaSolicitacao(solicitacaoCompraId: string): Promise<ItemSolicitacaoCompra[]> {
    try {
      const records = await prisma.itemSolicitacaoCompra.findMany({
        where: { solicitacaoCompraId },
      });
      return records.map((r) => this.itemToDomain(r));
    } catch (error) {
      throw new RepositoryError(
        'Erro ao listar itens da solicitação de compra',
        'ITEM_SOLICITACAO_LIST_ERROR',
        error as Error,
      );
    }
  }

  async listar(filtros?: FiltrosSolicitacao): Promise<SolicitacaoCompra[]> {
    const limite = filtros?.limite ?? 50;
    const offset = ((filtros?.pagina ?? 1) - 1) * limite;
    try {
      const records = await prisma.solicitacaoCompra.findMany({
        where: {
          ...(filtros?.status ? { status: filtros.status as PrismaStatusSolicitacaoCompra } : {}),
          ...(filtros?.solicitadoPor ? { solicitadoPor: filtros.solicitadoPor } : {}),
        },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError(
        'Erro ao listar solicitações de compra',
        'SOLICITACAO_LIST_ERROR',
        error as Error,
      );
    }
  }

  async atualizar(solicitacao: SolicitacaoCompra): Promise<SolicitacaoCompra> {
    try {
      const record = await prisma.solicitacaoCompra.update({
        where: { id: solicitacao.id },
        data: {
          fornecedorId: solicitacao.fornecedorId,
          status: solicitacao.status as PrismaStatusSolicitacaoCompra,
          justificativa: solicitacao.justificativa,
          formaPagamento: solicitacao.formaPagamento as PrismaFormaPagamento | null,
          parcelas: solicitacao.parcelas,
          aprovadoPor: solicitacao.aprovadoPor,
          aprovadoEm: solicitacao.aprovadoEm,
          rejeitadoPor: solicitacao.rejeitadoPor,
          rejeitadoEm: solicitacao.rejeitadoEm,
          motivoRejeicao: solicitacao.motivoRejeicao,
          executadoPor: solicitacao.executadoPor,
          executadoEm: solicitacao.executadoEm,
          valorTotal: solicitacao.valorTotal,
          observacoes: solicitacao.observacoes,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError(
        'Erro ao atualizar solicitação de compra',
        'SOLICITACAO_UPDATE_ERROR',
        error as Error,
      );
    }
  }

  private mapStatus(status: SolicitacaoCompraRecord['status']): StatusSolicitacaoCompra {
    const map: Record<SolicitacaoCompraRecord['status'], StatusSolicitacaoCompra> = {
      PENDENTE: StatusSolicitacaoCompra.PENDENTE,
      APROVADO: StatusSolicitacaoCompra.APROVADO,
      REJEITADO: StatusSolicitacaoCompra.REJEITADO,
      COMPRADO: StatusSolicitacaoCompra.COMPRADO,
      CANCELADO: StatusSolicitacaoCompra.CANCELADO,
    };
    return map[status];
  }

  private toDomain(record: SolicitacaoCompraRecord): SolicitacaoCompra {
    const props: SolicitacaoCompraProps = {
      id: record.id,
      acNumero: record.acNumero,
      ocNumero: record.ocNumero,
      solicitadoPor: record.solicitadoPor,
      setorSolicitante: record.setorSolicitante,
      fornecedorId: record.fornecedorId,
      status: this.mapStatus(record.status),
      justificativa: record.justificativa,
      formaPagamento: record.formaPagamento as FormaPagamento | null,
      parcelas: record.parcelas,
      aprovadoPor: record.aprovadoPor,
      aprovadoEm: record.aprovadoEm,
      rejeitadoPor: record.rejeitadoPor,
      rejeitadoEm: record.rejeitadoEm,
      motivoRejeicao: record.motivoRejeicao,
      executadoPor: record.executadoPor,
      executadoEm: record.executadoEm,
      valorTotal: record.valorTotal ? record.valorTotal.toNumber() : null,
      observacoes: record.observacoes,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    };
    return SolicitacaoCompra.create(props);
  }

  private itemToDomain(record: ItemSolicitacaoCompraRecord): ItemSolicitacaoCompra {
    const props: ItemSolicitacaoCompraProps = {
      id: record.id,
      solicitacaoCompraId: record.solicitacaoCompraId,
      itemInventarioId: record.itemInventarioId,
      nomeProduto: record.nomeProduto,
      quantidade: record.quantidade,
      precoEstimado: record.precoEstimado ? record.precoEstimado.toNumber() : null,
      precoReal: record.precoReal ? record.precoReal.toNumber() : null,
    };
    return ItemSolicitacaoCompra.create(props);
  }
}
