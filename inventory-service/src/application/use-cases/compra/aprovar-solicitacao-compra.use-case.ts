import { SolicitacaoCompra, FormaPagamento } from '@/domain/compra/solicitacao-compra.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { publicarCompraAprovada } from '@messaging/producers/compra.producer';

export interface AprovarSolicitacaoCompraInput {
  id: string;
  aprovadoPor: string;
  regraAprovador: string;
  setorAprovador: string | null;
  formaPagamento: FormaPagamento;
  parcelas: number;
}

export class AprovarSolicitacaoCompraUseCase {
  constructor(private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository) {}

  async execute(input: AprovarSolicitacaoCompraInput): Promise<SolicitacaoCompra> {
    const solicitacao = await this.solicitacaoRepo.buscarPorId(input.id);

    if (!solicitacao) {
      throw new DomainError(`Solicitação de compra "${input.id}" não encontrada`);
    }

    if (input.regraAprovador === 'GESTOR') {
      if (!input.setorAprovador) {
        throw new DomainError('Gestor sem setor definido não pode aprovar solicitações');
      }
      if (solicitacao.setorSolicitante !== input.setorAprovador) {
        throw new DomainError(
          `Gestor do setor "${input.setorAprovador}" não pode aprovar solicitação do setor "${solicitacao.setorSolicitante}"`,
        );
      }
    }

    const aprovada = solicitacao.aprovar(input.aprovadoPor, input.formaPagamento, input.parcelas);
    const atualizada = await this.solicitacaoRepo.atualizar(aprovada);
    await publicarCompraAprovada(atualizada);

    return atualizada;
  }
}
