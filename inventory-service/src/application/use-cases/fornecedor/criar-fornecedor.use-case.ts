import { randomUUID } from 'crypto';
import { Fornecedor } from '@/domain/inventario/fornecedor.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaFornecedorRepository } from '@infrastructure/repositories/prisma-fornecedor.repository';

export interface CriarFornecedorInput {
  nome: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
}

export class CriarFornecedorUseCase {
  constructor(private readonly fornecedorRepo: PrismaFornecedorRepository) {}

  async execute(input: CriarFornecedorInput): Promise<Fornecedor> {
    if (input.cnpj) {
      const existente = await this.fornecedorRepo.buscarPorCnpj(input.cnpj);
      if (existente) {
        throw new DomainError(`Fornecedor com CNPJ "${input.cnpj}" já cadastrado`);
      }
    }

    const agora = new Date();
    const fornecedor = Fornecedor.create({
      id: randomUUID(),
      nome: input.nome,
      cnpj: input.cnpj ?? null,
      email: input.email ?? null,
      telefone: input.telefone ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    return this.fornecedorRepo.criar(fornecedor);
  }
}
