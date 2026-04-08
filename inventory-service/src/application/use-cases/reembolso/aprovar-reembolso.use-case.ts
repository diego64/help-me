import { Reembolso } from '@/domain/reembolso/reembolso.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository';
import { publicarReembolsoAprovado } from '@messaging/producers/reembolso.producer';

export interface AprovarReembolsoInput {
  id: string;
  aprovadoPor: string;
}

export class AprovarReembolsoUseCase {
  constructor(private readonly reembolsoRepo: PrismaReembolsoRepository) {}

  async execute(input: AprovarReembolsoInput): Promise<Reembolso> {
    const reembolso = await this.reembolsoRepo.buscarPorId(input.id);

    if (!reembolso) {
      throw new DomainError(`Reembolso "${input.id}" não encontrado`);
    }

    const aprovado = reembolso.aprovar(input.aprovadoPor);
    const atualizado = await this.reembolsoRepo.atualizar(aprovado);
    await publicarReembolsoAprovado(atualizado);

    return atualizado;
  }
}
