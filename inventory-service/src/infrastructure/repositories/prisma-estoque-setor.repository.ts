import { Prisma } from '@prisma/client';
import { EstoqueSetor } from '../../domain/inventario/estoque-setor.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

type EstoqueSetorRecord = Prisma.EstoqueSetorGetPayload<Record<string, never>>;

export type EstoqueSetorComItem = EstoqueSetorRecord & {
  itemInventario: {
    id: string;
    numero: string;
    nome: string;
    sku: string;
    unidade: string;
  };
};

export class PrismaEstoqueSetorRepository {
  async upsert(itemInventarioId: string, setor: string, quantidade: number): Promise<EstoqueSetor> {
    try {
      const record = await prisma.estoqueSetor.upsert({
        where: { itemInventarioId_setor: { itemInventarioId, setor } },
        update: { quantidade: { increment: quantidade } },
        create: { itemInventarioId, setor, quantidade },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar estoque do setor', 'ESTOQUE_SETOR_UPSERT_ERROR', error as Error);
    }
  }

  async listarPorSetor(setor: string): Promise<EstoqueSetorComItem[]> {
    try {
      return await prisma.estoqueSetor.findMany({
        where: { setor: { equals: setor, mode: 'insensitive' }, quantidade: { gt: 0 } },
        include: {
          itemInventario: { select: { id: true, numero: true, nome: true, sku: true, unidade: true } },
        },
        orderBy: { itemInventario: { nome: 'asc' } },
      });
    } catch (error) {
      throw new RepositoryError('Erro ao listar estoque do setor', 'ESTOQUE_SETOR_LIST_ERROR', error as Error);
    }
  }

  async listarPorItem(itemInventarioId: string): Promise<EstoqueSetor[]> {
    try {
      const records = await prisma.estoqueSetor.findMany({
        where: { itemInventarioId, quantidade: { gt: 0 } },
        orderBy: { setor: 'asc' },
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar setores do item', 'ESTOQUE_SETOR_LIST_ERROR', error as Error);
    }
  }

  private toDomain(record: EstoqueSetorRecord): EstoqueSetor {
    return EstoqueSetor.create({
      id: record.id,
      itemInventarioId: record.itemInventarioId,
      setor: record.setor,
      quantidade: record.quantidade,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    });
  }
}
