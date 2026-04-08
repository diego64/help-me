import { Fornecedor } from '../../domain/inventario/fornecedor.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

type FornecedorRecord = {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
};

export class PrismaFornecedorRepository {
  async criar(fornecedor: Fornecedor): Promise<Fornecedor> {
    try {
      const record = await prisma.fornecedor.create({
        data: {
          id: fornecedor.id,
          nome: fornecedor.nome,
          cnpj: fornecedor.cnpj,
          email: fornecedor.email,
          telefone: fornecedor.telefone,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao criar fornecedor', 'FORNECEDOR_CREATE_ERROR', error as Error);
    }
  }

  async buscarPorId(id: string): Promise<Fornecedor | null> {
    try {
      const record = await prisma.fornecedor.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar fornecedor por ID', 'FORNECEDOR_FIND_ERROR', error as Error);
    }
  }

  async buscarPorCnpj(cnpj: string): Promise<Fornecedor | null> {
    try {
      const record = await prisma.fornecedor.findUnique({ where: { cnpj } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar fornecedor por CNPJ', 'FORNECEDOR_FIND_ERROR', error as Error);
    }
  }

  async listar(paginacao?: { pagina?: number; limite?: number }): Promise<Fornecedor[]> {
    const limite = paginacao?.limite ?? 50;
    const offset = ((paginacao?.pagina ?? 1) - 1) * limite;
    try {
      const records = await prisma.fornecedor.findMany({
        orderBy: { nome: 'asc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar fornecedores', 'FORNECEDOR_LIST_ERROR', error as Error);
    }
  }

  async atualizar(fornecedor: Fornecedor): Promise<Fornecedor> {
    try {
      const record = await prisma.fornecedor.update({
        where: { id: fornecedor.id },
        data: {
          nome: fornecedor.nome,
          cnpj: fornecedor.cnpj,
          email: fornecedor.email,
          telefone: fornecedor.telefone,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar fornecedor', 'FORNECEDOR_UPDATE_ERROR', error as Error);
    }
  }

  private toDomain(record: FornecedorRecord): Fornecedor {
    return Fornecedor.create({
      id: record.id,
      nome: record.nome,
      cnpj: record.cnpj,
      email: record.email,
      telefone: record.telefone,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    });
  }
}
