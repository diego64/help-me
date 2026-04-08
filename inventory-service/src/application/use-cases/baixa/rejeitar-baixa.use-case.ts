import { Baixa } from '@/domain/baixa/baixa.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { publicarBaixaRejeitada } from '@messaging/producers/baixa.producer';

export interface RejeitarBaixaInput {
  id: string;
  rejeitadoPor: string;
  motivoRejeicao: string;
}

export class RejeitarBaixaUseCase {
  constructor(private readonly baixaRepo: PrismaBaixaRepository) {}

  async execute(input: RejeitarBaixaInput): Promise<Baixa> {
    const baixa = await this.baixaRepo.buscarPorId(input.id);

    if (!baixa) {
      throw new DomainError(`Baixa "${input.id}" não encontrada`);
    }

    const rejeitada = baixa.rejeitar(input.rejeitadoPor, input.motivoRejeicao);
    const atualizada = await this.baixaRepo.atualizar(rejeitada);
    await publicarBaixaRejeitada(atualizada);

    return atualizada;
  }
}
