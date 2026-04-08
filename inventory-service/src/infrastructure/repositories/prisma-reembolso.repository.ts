import { Prisma, StatusReembolso as PrismaStatusReembolso } from '@prisma/client';
import { Reembolso, ReembolsoProps, StatusReembolso } from '../../domain/reembolso/reembolso.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

// Tipo gerado pelo Prisma — sempre em sync com o schema
type ReembolsoRecord = Prisma.ReembolsoGetPayload<Record<string, never>>;

type FiltrosReembolso = {
  status?: StatusReembolso;
  solicitadoPor?: string;
  pagina?: number;
  limite?: number;
};

export class PrismaReembolsoRepository {
  async criar(reembolso: Reembolso): Promise<Reembolso> {
    try {
      const record = await prisma.reembolso.create({
        data: {
          id: reembolso.id,
          solicitadoPor: reembolso.solicitadoPor,
          solicitacaoCompraId: reembolso.solicitacaoCompraId,
          valor: reembolso.valor,
          descricao: reembolso.descricao,
          urlComprovante: reembolso.urlComprovante,
          status: reembolso.status as PrismaStatusReembolso,
          nfe: reembolso.nfe,
          dataEmissao: reembolso.dataEmissao,
          cnpjFornecedor: reembolso.cnpjFornecedor,
          observacoes: reembolso.observacoes,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao criar reembolso', 'REEMBOLSO_CREATE_ERROR', error as Error);
    }
  }

  async buscarPorId(id: string): Promise<Reembolso | null> {
    try {
      const record = await prisma.reembolso.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar reembolso por ID', 'REEMBOLSO_FIND_ERROR', error as Error);
    }
  }

  async buscarPorSolicitacaoCompra(solicitacaoCompraId: string): Promise<Reembolso | null> {
    try {
      const record = await prisma.reembolso.findUnique({ where: { solicitacaoCompraId } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError(
        'Erro ao buscar reembolso por solicitação de compra',
        'REEMBOLSO_FIND_ERROR',
        error as Error,
      );
    }
  }

  async listar(filtros?: FiltrosReembolso): Promise<Reembolso[]> {
    const limite = filtros?.limite ?? 50;
    const offset = ((filtros?.pagina ?? 1) - 1) * limite;
    try {
      const records = await prisma.reembolso.findMany({
        where: {
          ...(filtros?.status ? { status: filtros.status as PrismaStatusReembolso } : {}),
          ...(filtros?.solicitadoPor ? { solicitadoPor: filtros.solicitadoPor } : {}),
        },
        orderBy: { criadoEm: 'desc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar reembolsos', 'REEMBOLSO_LIST_ERROR', error as Error);
    }
  }

  async atualizar(reembolso: Reembolso): Promise<Reembolso> {
    try {
      const record = await prisma.reembolso.update({
        where: { id: reembolso.id },
        data: {
          urlComprovante: reembolso.urlComprovante,
          status: reembolso.status as PrismaStatusReembolso,
          aprovadoPor: reembolso.aprovadoPor,
          aprovadoEm: reembolso.aprovadoEm,
          rejeitadoPor: reembolso.rejeitadoPor,
          rejeitadoEm: reembolso.rejeitadoEm,
          motivoRejeicao: reembolso.motivoRejeicao,
          processadoPor: reembolso.processadoPor,
          processadoEm: reembolso.processadoEm,
          observacoes: reembolso.observacoes,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar reembolso', 'REEMBOLSO_UPDATE_ERROR', error as Error);
    }
  }

  private mapStatus(status: ReembolsoRecord['status']): StatusReembolso {
    const map: Record<ReembolsoRecord['status'], StatusReembolso> = {
      PENDENTE: StatusReembolso.PENDENTE,
      APROVADO: StatusReembolso.APROVADO,
      REJEITADO: StatusReembolso.REJEITADO,
      PAGO: StatusReembolso.PAGO,
    };
    return map[status];
  }

  private toDomain(record: ReembolsoRecord): Reembolso {
    const props: ReembolsoProps = {
      id: record.id,
      solicitadoPor: record.solicitadoPor,
      solicitacaoCompraId: record.solicitacaoCompraId,
      valor: record.valor.toNumber(),
      descricao: record.descricao,
      urlComprovante: record.urlComprovante,
      status: this.mapStatus(record.status),
      nfe: record.nfe,
      dataEmissao: record.dataEmissao,
      cnpjFornecedor: record.cnpjFornecedor,
      aprovadoPor: record.aprovadoPor,
      aprovadoEm: record.aprovadoEm,
      rejeitadoPor: record.rejeitadoPor,
      rejeitadoEm: record.rejeitadoEm,
      motivoRejeicao: record.motivoRejeicao,
      processadoPor: record.processadoPor,
      processadoEm: record.processadoEm,
      observacoes: record.observacoes,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    };
    return Reembolso.create(props);
  }
}
