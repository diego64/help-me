import { Categoria } from '../../domain/inventario/categoria.entity';
import { prisma } from '../database/prisma.client';
import { RepositoryError } from './repository.error';

type CategoriaRecord = {
  id: string;
  nome: string;
  descricao: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
};

export class PrismaCategoriaRepository {
  async criar(categoria: Categoria): Promise<Categoria> {
    try {
      const record = await prisma.categoria.create({
        data: {
          id: categoria.id,
          nome: categoria.nome,
          descricao: categoria.descricao,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao criar categoria', 'CATEGORIA_CREATE_ERROR', error as Error);
    }
  }

  async buscarPorId(id: string): Promise<Categoria | null> {
    try {
      const record = await prisma.categoria.findUnique({ where: { id } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar categoria por ID', 'CATEGORIA_FIND_ERROR', error as Error);
    }
  }

  async buscarPorNome(nome: string): Promise<Categoria | null> {
    try {
      const record = await prisma.categoria.findUnique({ where: { nome } });
      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new RepositoryError('Erro ao buscar categoria por nome', 'CATEGORIA_FIND_ERROR', error as Error);
    }
  }

  async listar(paginacao?: { pagina?: number; limite?: number }): Promise<Categoria[]> {
    const limite = paginacao?.limite ?? 50;
    const offset = ((paginacao?.pagina ?? 1) - 1) * limite;
    try {
      const records = await prisma.categoria.findMany({
        orderBy: { nome: 'asc' },
        take: limite,
        skip: offset,
      });
      return records.map((r) => this.toDomain(r));
    } catch (error) {
      throw new RepositoryError('Erro ao listar categorias', 'CATEGORIA_LIST_ERROR', error as Error);
    }
  }

  async atualizar(categoria: Categoria): Promise<Categoria> {
    try {
      const record = await prisma.categoria.update({
        where: { id: categoria.id },
        data: {
          nome: categoria.nome,
          descricao: categoria.descricao,
        },
      });
      return this.toDomain(record);
    } catch (error) {
      throw new RepositoryError('Erro ao atualizar categoria', 'CATEGORIA_UPDATE_ERROR', error as Error);
    }
  }

  async deletar(id: string): Promise<void> {
    try {
      await prisma.categoria.delete({ where: { id } });
    } catch (error) {
      throw new RepositoryError('Erro ao deletar categoria', 'CATEGORIA_DELETE_ERROR', error as Error);
    }
  }

  private toDomain(record: CategoriaRecord): Categoria {
    return Categoria.create({
      id: record.id,
      nome: record.nome,
      descricao: record.descricao,
      criadoEm: record.criadoEm,
      atualizadoEm: record.atualizadoEm,
    });
  }
}
