import { MotivoBaixa, Prisma } from '@prisma/client';

import { Baixa, BaixaProps, StatusBaixa } from '../../domain/baixa/baixa.entity';
import { ItemBaixa, ItemBaixaProps } from '../../domain/baixa/item-baixa.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

// Tipos gerados pelo Prisma — sempre em sync com o schema
type BaixaRecord = Prisma.BaixaGetPayload<Record<string, never>>;
type ItemBaixaRecord = Prisma.ItemBaixaGetPayload<Record<string, never>>;

type FiltrosBaixa = {
  status?: StatusBaixa;
  solicitadoPor?: string;
  pagina?: number;
  limite?: number;
};

export class PrismaBaixaRepository {
  async criar(baixa: Baixa, itens: ItemBaixa[]): Promise<Baixa> {
    try {
      const record = await prisma.baixa.create({
        data: {
          id: baixa.id,
          solicitadoPor: baixa.solicitadoPor,
          perfilSolicitante: baixa.perfilSolicitante,
          status: baixa.status,
          justificativa: baixa.justificativa,
          observacoes: baixa.observacoes,
          itens: {
            create: itens.map((item) => ({
              id: item.id,
              itemInventarioId: item.itemInventarioId,
              quantidade: item.quantidade,
              motivo: item.motivo ? (item.motivo as MotivoBaixa) : null,
            })) satisfies Prisma.ItemBaixaUncheckedCreateWithoutBaixaInput[],
          },
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao criar baixa', 'BAIXA_CREATE_ERROR', error as Error);
    }
  }

  async buscarPorId(id: string): Promise<Baixa | null> {
    try {
      const record = await prisma.baixa.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar baixa por ID', 'BAIXA_FIND_ERROR', error as Error);
    }
  }

  async listarItensDaBaixa(baixaId: string): Promise<ItemBaixa[]> {
    try {
      const records = await prisma.itemBaixa.findMany({ where: { baixaId } });
      return records.map((r) => this.itemToDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar itens da baixa', 'ITEM_BAIXA_LIST_ERROR', error as Error);
    }
  }

  async listar(filtros?: FiltrosBaixa): Promise<Baixa[]> {
    const limite = filtros?.limite ?? 50;
    const offset = ((filtros?.pagina ?? 1) - 1) * limite;
    try {
      const records = await prisma.baixa.findMany({
        where: {
          ...(filtros?.status ? { status: filtros.status } : {}),
          ...(filtros?.solicitadoPor ? { solicitadoPor: filtros.solicitadoPor } : {}),
        },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar baixas', 'BAIXA_LIST_ERROR', error as Error);
    }
  }

  async atualizar(baixa: Baixa): Promise<Baixa> {
    try {
      const record = await prisma.baixa.update({
        where: { id: baixa.id },
        data: {
          status: baixa.status,
          aprovadoTecnicoPor: baixa.aprovadoTecnicoPor,
          aprovadoTecnicoEm: baixa.aprovadoTecnicoEm,
          aprovadoGestorPor: baixa.aprovadoGestorPor,
          aprovadoGestorEm: baixa.aprovadoGestorEm,
          rejeitadoPor: baixa.rejeitadoPor,
          rejeitadoEm: baixa.rejeitadoEm,
          motivoRejeicao: baixa.motivoRejeicao,
          executadoPor: baixa.executadoPor,
          executadoEm: baixa.executadoEm,
          observacoes: baixa.observacoes,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar baixa', 'BAIXA_UPDATE_ERROR', error as Error);
    }
  }

  private mapStatus(status: BaixaRecord['status']): StatusBaixa {
    const map: Record<BaixaRecord['status'], StatusBaixa> = {
      PENDENTE: StatusBaixa.PENDENTE,
      APROVADO_TECNICO: StatusBaixa.APROVADO_TECNICO,
      APROVADO_GESTOR: StatusBaixa.APROVADO_GESTOR,
      CONCLUIDO: StatusBaixa.CONCLUIDO,
      REJEITADO: StatusBaixa.REJEITADO,
    };
    return map[status];
  }

  private mapMotivo(motivo: ItemBaixaRecord['motivo']): MotivoBaixa | null {
    if (!motivo) return null;
    const map: Record<MotivoBaixa, MotivoBaixa> = {
      QUEBRA: MotivoBaixa.QUEBRA,
      PERDA: MotivoBaixa.PERDA,
      VENCIMENTO: MotivoBaixa.VENCIMENTO,
      OBSOLESCENCIA: MotivoBaixa.OBSOLESCENCIA,
      OUTROS: MotivoBaixa.OUTROS,
    };
    return map[motivo];
  }

  private toDomain(record: BaixaRecord): Baixa {
    const props: BaixaProps = {
      id: record.id,
      solicitadoPor: record.solicitadoPor,
      perfilSolicitante: record.perfilSolicitante,
      status: this.mapStatus(record.status),
      justificativa: record.justificativa,
      aprovadoTecnicoPor: record.aprovadoTecnicoPor,
      aprovadoTecnicoEm: record.aprovadoTecnicoEm,
      aprovadoGestorPor: record.aprovadoGestorPor,
      aprovadoGestorEm: record.aprovadoGestorEm,
      rejeitadoPor: record.rejeitadoPor,
      rejeitadoEm: record.rejeitadoEm,
      motivoRejeicao: record.motivoRejeicao,
      executadoPor: record.executadoPor,
      executadoEm: record.executadoEm,
      observacoes: record.observacoes,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    };
    return Baixa.create(props);
  }

  private itemToDomain(record: ItemBaixaRecord): ItemBaixa {
    const props: ItemBaixaProps = {
      id: record.id,
      baixaId: record.baixaId,
      itemInventarioId: record.itemInventarioId,
      quantidade: record.quantidade,
      motivo: this.mapMotivo(record.motivo),
    };
    return ItemBaixa.create(props);
  }
}