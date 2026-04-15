import { Reembolso } from '@/domain/reembolso/reembolso.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository';
import { publicarReembolsoRejeitado } from '@messaging/producers/reembolso.producer';

export interface RejeitarReembolsoInput {
  id: string;
  rejeitadoPor: string;
  motivoRejeicao: string;
}

export class RejeitarReembolsoUseCase {
  constructor(private readonly reembolsoRepo: PrismaReembolsoRepository) {}

  async execute(input: RejeitarReembolsoInput): Promise<Reembolso> {
    const reembolso = await this.reembolsoRepo.buscarPorId(input.id);

    if (!reembolso) {
      throw new DomainError(`Reembolso "${input.id}" não encontrado`);
    }

    const rejeitado = reembolso.rejeitar(input.rejeitadoPor, input.motivoRejeicao);
    const atualizado = await this.reembolsoRepo.atualizar(rejeitado);
    await publicarReembolsoRejeitado(atualizado);

    return atualizado;
  }
}
