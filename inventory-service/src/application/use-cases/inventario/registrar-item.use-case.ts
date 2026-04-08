import { randomUUID } from 'crypto';
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { proximoNumero } from '@infrastructure/database/numero-sequencial';

export interface RegistrarItemInput {
  nome: string;
  sku: string;
  descricao?: string;
  unidade: UnidadeMedida;
  quantidade: number;       // unidades físicas a registrar — cada uma vira um INV próprio
  estoqueMinimo?: number;
  categoriaId: string;
  ocNumero: string;
  criadoPor: string;
}

export class RegistrarItemUseCase {
  constructor(
    private readonly itemRepo: PrismaItemInventarioRepository,
    private readonly categoriaRepo: PrismaCategoriaRepository,
    private readonly solicitacaoRepo: PrismaSolicitacaoCompraRepository,
  ) {}

  async execute(input: RegistrarItemInput): Promise<ItemInventario[]> {
    if (!Number.isInteger(input.quantidade) || input.quantidade < 1) {
      throw new DomainError('quantidade deve ser um inteiro maior que zero');
    }

    const [categoriaExistente, solicitacao] = await Promise.all([
      this.categoriaRepo.buscarPorId(input.categoriaId),
      this.solicitacaoRepo.buscarPorOcNumero(input.ocNumero),
    ]);

    if (!categoriaExistente) {
      throw new DomainError(`Categoria "${input.categoriaId}" não encontrada`);
    }
    if (!solicitacao) {
      throw new DomainError(`Ordem de compra "${input.ocNumero}" não encontrada`);
    }
    if (solicitacao.status !== StatusSolicitacaoCompra.COMPRADO) {
      throw new DomainError(
        `Ordem de compra "${input.ocNumero}" está com status "${solicitacao.status}" — somente O.C com status COMPRADO pode ser usada para registrar itens`,
      );
    }

    // Verifica se algum SKU gerado já existe antes de persistir qualquer item
    const skusGerados = Array.from({ length: input.quantidade }, (_, i) =>
      input.quantidade === 1 ? input.sku : `${input.sku}-${String(i + 1).padStart(2, '0')}`,
    );

    const skusExistentes = await Promise.all(skusGerados.map(sku => this.itemRepo.buscarPorSku(sku)));
    const conflito = skusGerados.find((_, i) => skusExistentes[i] !== null);
    if (conflito) {
      throw new DomainError(`SKU "${conflito}" já está em uso`);
    }

    // Gera números INV sequencialmente (atômico — sem gaps)
    const numeros: string[] = [];
    for (let i = 0; i < input.quantidade; i++) {
      numeros.push(await proximoNumero('INV'));
    }

    const agora = new Date();

    const itens = skusGerados.map((sku, i) =>
      ItemInventario.create({
        id: randomUUID(),
        numero: numeros[i]!,
        nome: input.nome,
        sku,
        descricao: input.descricao ?? null,
        unidade: input.unidade,
        estoqueAtual: 1,
        estoqueMinimo: input.estoqueMinimo ?? 0,
        categoriaId: input.categoriaId,
        ocNumero: input.ocNumero,
        criadoPor: input.criadoPor,
        criadoEm: agora,
        atualizadoEm: agora,
      }),
    );

    return Promise.all(itens.map(item => this.itemRepo.criar(item)));
  }
}
