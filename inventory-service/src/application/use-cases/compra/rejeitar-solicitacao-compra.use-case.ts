import { SolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { publicarCompraRejeitada } from '@messaging/producers/compra.producer';

export interface RejeitarSolicitacaoCompraInput {
  id: string;
  rejeitadoPor: string;
  motivoRejeicao: string;
}

export class RejeitarSolicitacaoCompraUseCase {
  constructor(private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository) {}

  async execute(input: RejeitarSolicitacaoCompraInput): Promise<SolicitacaoCompra> {
    const solicitacao = await this.solicitacaoRepo.buscarPorId(input.id);

    if (!solicitacao) {
      throw new DomainError(`Solicitação de compra "${input.id}" não encontrada`);
    }

    const rejeitada = solicitacao.rejeitar(input.rejeitadoPor, input.motivoRejeicao);
    const atualizada = await this.solicitacaoRepo.atualizar(rejeitada);
    await publicarCompraRejeitada(atualizada);

    return atualizada;
  }
}
