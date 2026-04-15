import { Reembolso } from '@/domain/reembolso/reembolso.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository';
import { publicarReembolsoPago } from '@messaging/producers/reembolso.producer';

export interface ProcessarReembolsoInput {
  id: string;
  processadoPor: string;
}

export class ProcessarReembolsoUseCase {
  constructor(private readonly reembolsoRepo: PrismaReembolsoRepository) {}

  async execute(input: ProcessarReembolsoInput): Promise<Reembolso> {
    const reembolso = await this.reembolsoRepo.buscarPorId(input.id);

    if (!reembolso) {
      throw new DomainError(`Reembolso "${input.id}" não encontrado`);
    }

    const pago = reembolso.pagar(input.processadoPor);
    const atualizado = await this.reembolsoRepo.atualizar(pago);
    await publicarReembolsoPago(atualizado);

    return atualizado;
  }
}
