import jwt from 'jsonwebtoken';

const JWT_SECRET = 'e2e-test-secret-key-supersecure';

export type Regra = 'ADMIN' | 'GESTOR' | 'TECNICO' | 'USUARIO';

export function makeToken(
  regra: Regra = 'ADMIN',
  setor: string | null = null,
  id = 'user-e2e-id',
  email = 'e2e@test.com',
): string {
  return jwt.sign({ id, email, regra, setor }, JWT_SECRET, { expiresIn: '1h' });
}

// Fixtures reutilizáveis entre os testes

export const categoriaRecord = {
  id: 'cat-e2e-1',
  nome: 'Eletrônicos',
  descricao: 'Equipamentos eletrônicos',
  criadoEm: new Date('2024-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2024-01-01T00:00:00.000Z'),
};

export const itemRecord = {
  id: 'item-e2e-1',
  numero: 'INV0000001',
  nome: 'Notebook Dell',
  sku: 'NB-DELL-001',
  descricao: 'Notebook Dell Inspiron',
  unidade: 'UN',
  estoqueAtual: 5,
  estoqueMinimo: 2,
  categoriaId: 'cat-e2e-1',
  ocNumero: 'OC0000001',
  criadoPor: 'user-e2e-id',
  criadoEm: new Date('2024-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2024-01-01T00:00:00.000Z'),
};

export const solicitacaoRecord = {
  id: 'compra-e2e-1',
  acNumero: 'AC0000001',
  ocNumero: 'OC0000001',
  solicitadoPor: 'user-e2e-id',
  setorSolicitante: 'TECNOLOGIA_INFORMACAO',
  fornecedorId: null,
  status: 'PENDENTE' as const,
  justificativa: 'Necessidade de compra',
  formaPagamento: null,
  parcelas: 0,
  aprovadoPor: null,
  aprovadoEm: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  executadoPor: null,
  executadoEm: null,
  valorTotal: null,
  observacoes: null,
  criadoEm: new Date('2024-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2024-01-01T00:00:00.000Z'),
};

export const itemSolicitacaoRecord = {
  id: 'item-sol-e2e-1',
  solicitacaoCompraId: 'compra-e2e-1',
  itemInventarioId: null,
  nomeProduto: 'Notebook Dell',
  quantidade: 2,
  precoEstimado: null,
  precoReal: null,
};

// Simula o tipo Prisma.Decimal para campos Decimal no banco
const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n), valueOf: () => n });

export const reembolsoRecord = {
  id: 'reembolso-e2e-1',
  solicitadoPor: 'user-e2e-id',
  solicitacaoCompraId: null,
  valor: decimal(150.0),
  descricao: 'Reembolso de material',
  urlComprovante: null,
  status: 'PENDENTE' as const,
  nfe: null,
  dataEmissao: null,
  cnpjFornecedor: null,
  observacoes: null,
  aprovadoPor: null,
  aprovadoEm: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  processadoPor: null,
  processadoEm: null,
  criadoEm: new Date('2024-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2024-01-01T00:00:00.000Z'),
};

export const baixaRecord = {
  id: 'baixa-e2e-1',
  solicitadoPor: 'user-e2e-id',
  perfilSolicitante: 'ADMIN',
  status: 'PENDENTE' as const,
  justificativa: 'Item danificado',
  observacoes: null,
  aprovadoPorTecnico: null,
  aprovadoEmTecnico: null,
  aprovadoPorGestor: null,
  aprovadoEmGestor: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  executadoPor: null,
  executadoEm: null,
  criadoEm: new Date('2024-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2024-01-01T00:00:00.000Z'),
};

export const itemBaixaRecord = {
  id: 'item-baixa-e2e-1',
  baixaId: 'baixa-e2e-1',
  itemInventarioId: 'item-e2e-1',
  quantidade: 1,
  motivo: 'OBSOLESCENCIA',
};
