import { SolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { publicarCompraCancelada } from '@messaging/producers/compra.producer';

export interface CancelarSolicitacaoCompraInput {
  id: string;
}

export class CancelarSolicitacaoCompraUseCase {
  constructor(private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository) {}

  async execute(input: CancelarSolicitacaoCompraInput): Promise<SolicitacaoCompra> {
    const solicitacao = await this.solicitacaoRepo.buscarPorId(input.id);

    if (!solicitacao) {
      throw new DomainError(`Solicitação de compra "${input.id}" não encontrada`);
    }

    const cancelada = solicitacao.cancelar();
    const atualizada = await this.solicitacaoRepo.atualizar(cancelada);
    await publicarCompraCancelada(atualizada);

    return atualizada;
  }
}
