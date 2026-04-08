import { randomUUID } from 'crypto';
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { publicarReembolsoCriado } from '@messaging/producers/reembolso.producer';

export interface CriarReembolsoInput {
  solicitadoPor: string;
  solicitacaoCompraId?: string;
  valor: number;
  descricao: string;
  nfe?: string;
  dataEmissao?: Date;
  cnpjFornecedor?: string;
  observacoes?: string;
}

export class CriarReembolsoUseCase {
  constructor(
    private readonly reembolsoRepo: PrismaReembolsoRepository,
    private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository,
  ) {}

  async execute(input: CriarReembolsoInput): Promise<Reembolso> {
    if (input.solicitacaoCompraId) {
      const [solicitacao, reembolsoExistente] = await Promise.all([
        this.solicitacaoRepo.buscarPorId(input.solicitacaoCompraId),
        this.reembolsoRepo.buscarPorSolicitacaoCompra(input.solicitacaoCompraId),
      ]);

      if (!solicitacao) {
        throw new DomainError(`Solicitação de compra "${input.solicitacaoCompraId}" não encontrada`);
      }

      if (reembolsoExistente) {
        throw new DomainError(
          `Já existe um reembolso para a solicitação de compra "${input.solicitacaoCompraId}"`,
        );
      }
    }

    const agora = new Date();
    const reembolso = Reembolso.create({
      id: randomUUID(),
      solicitadoPor: input.solicitadoPor,
      solicitacaoCompraId: input.solicitacaoCompraId ?? null,
      valor: input.valor,
      descricao: input.descricao,
      status: StatusReembolso.PENDENTE,
      nfe: input.nfe ?? null,
      dataEmissao: input.dataEmissao ?? null,
      cnpjFornecedor: input.cnpjFornecedor ?? null,
      observacoes: input.observacoes ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    const criado = await this.reembolsoRepo.criar(reembolso);
    await publicarReembolsoCriado(criado);

    return criado;
  }
}
