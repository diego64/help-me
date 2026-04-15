import { Baixa } from '@/domain/baixa/baixa.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { publicarBaixaAprovadaTecnico } from '@messaging/producers/baixa.producer';

export interface AprovarBaixaTecnicoInput {
  id: string;
  aprovadoPor: string;
}

export class AprovarBaixaTecnicoUseCase {
  constructor(private readonly baixaRepo: PrismaBaixaRepository) {}

  async execute(input: AprovarBaixaTecnicoInput): Promise<Baixa> {
    const baixa = await this.baixaRepo.buscarPorId(input.id);

    if (!baixa) {
      throw new DomainError(`Baixa "${input.id}" não encontrada`);
    }

    const aprovada = baixa.aprovarTecnico(input.aprovadoPor);
    const atualizada = await this.baixaRepo.atualizar(aprovada);
    await publicarBaixaAprovadaTecnico(atualizada);

    return atualizada;
  }
}
