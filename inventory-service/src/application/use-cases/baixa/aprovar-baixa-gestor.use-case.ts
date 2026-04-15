import { Baixa } from '@/domain/baixa/baixa.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { publicarBaixaAprovadaGestor } from '@messaging/producers/baixa.producer';

export interface AprovarBaixaGestorInput {
  id: string;
  aprovadoPor: string;
}

export class AprovarBaixaGestorUseCase {
  constructor(private readonly baixaRepo: PrismaBaixaRepository) {}

  async execute(input: AprovarBaixaGestorInput): Promise<Baixa> {
    const baixa = await this.baixaRepo.buscarPorId(input.id);

    if (!baixa) {
      throw new DomainError(`Baixa "${input.id}" não encontrada`);
    }

    const aprovada = baixa.aprovarGestor(input.aprovadoPor);
    const atualizada = await this.baixaRepo.atualizar(aprovada);
    await publicarBaixaAprovadaGestor(atualizada);

    return atualizada;
  }
}
