import { config } from 'dotenv'
config({ path: '.env' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

const AUTH_URL      = process.env.AUTH_SERVICE_URL      ?? 'http://localhost:3333'
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3334'

const SENHA = 'HelpMe@1234'

const CREDENCIAIS = [
  { perfil: 'ADMIN',         setor: 'TECNOLOGIA_INFORMACAO', email: 'diego.admin@helpme.com',              password: SENHA },
  { perfil: 'GESTOR',        setor: 'ADMINISTRACAO',         email: 'roberto.gestor@helpme.com',           password: SENHA },
  { perfil: 'GESTOR',        setor: 'RECURSOS_HUMANOS',      email: 'claudia.gestor@helpme.com',           password: SENHA },
  { perfil: 'GESTOR',        setor: 'TECNOLOGIA_INFORMACAO', email: 'eduardo.gestor@helpme.com',           password: SENHA },
  { perfil: 'COMPRADOR',     setor: 'TECNOLOGIA_INFORMACAO', email: 'luciana.comprador@helpme.com',        password: SENHA },
  { perfil: 'INVENTARIANTE', setor: 'TECNOLOGIA_INFORMACAO', email: 'rodrigo.inventariante@helpme.com',    password: SENHA },
  { perfil: 'TECNICO',       setor: 'TECNOLOGIA_INFORMACAO', email: 'carlos.tecnico@helpme.com',           password: SENHA },
  { perfil: 'TECNICO',       setor: 'TECNOLOGIA_INFORMACAO', email: 'rafael.tecnico@helpme.com',           password: SENHA },
  { perfil: 'TECNICO',       setor: 'TECNOLOGIA_INFORMACAO', email: 'patricia.tecnico@helpme.com',         password: SENHA },
  { perfil: 'USUARIO',       setor: 'ADMINISTRACAO',         email: 'ana.usuario@helpme.com',              password: SENHA },
  { perfil: 'USUARIO',       setor: 'RECURSOS_HUMANOS',      email: 'bruno.usuario@helpme.com',            password: SENHA },
  { perfil: 'USUARIO',       setor: 'TECNOLOGIA_INFORMACAO', email: 'fernanda.usuario@helpme.com',         password: SENHA },
]

const cred = (email: string): string => {
  const c = CREDENCIAIS.find(c => c.email === email)
  if (!c) throw new Error(`Credencial não encontrada para ${email}`)
  return c.password
}

// ==================== HELPERS ====================

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/auth/sessao/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Login falhou para ${email}: ${res.status} — ${body}`)
  }

  const data = await res.json() as { accessToken: string }
  return data.accessToken
}

async function post<T>(path: string, token: string, body: object): Promise<T> {
  const res = await fetch(`${INVENTORY_URL}/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`POST ${path} falhou: ${res.status} — ${texto}`)
  }

  return res.json() as Promise<T>
}

// ==================== SEED ====================

async function main() {
  console.log('🌱 Iniciando seed do inventory-service...\n')

  console.log('Limpando base de dados...')
  await prisma.itemSolicitacaoCompra.deleteMany()
  await prisma.solicitacaoCompra.deleteMany()
  await prisma.itemBaixa.deleteMany()
  await prisma.baixa.deleteMany()
  await prisma.reembolso.deleteMany()
  await prisma.estoqueSetor.deleteMany()
  await prisma.movimentacaoEstoque.deleteMany()
  await prisma.itemInventario.deleteMany()
  await prisma.categoria.deleteMany()
  await prisma.fornecedor.deleteMany()
  await prisma.contador.deleteMany()
  console.log('Base limpa.\n')

  console.log('Autenticando usuários no auth-service...')
  const emails = {
    inventariante: 'rodrigo.inventariante@helpme.com', // 0
    comprador:     'luciana.comprador@helpme.com',     // 1
    admin:         'diego.admin@helpme.com',           // 2
    roberto:       'roberto.gestor@helpme.com',        // 3
    claudia:       'claudia.gestor@helpme.com',        // 4
    eduardo:       'eduardo.gestor@helpme.com',        // 5
    ana:           'ana.usuario@helpme.com',           // 6
    bruno:         'bruno.usuario@helpme.com',         // 7
    fernanda:      'fernanda.usuario@helpme.com',      // 8
    carlos:        'carlos.tecnico@helpme.com',        // 9
    rafael:        'rafael.tecnico@helpme.com',        // 10
    patricia:      'patricia.tecnico@helpme.com',      // 11
  }

  const tokens = await Promise.all(Object.values(emails).map(e => login(e, cred(e))))
  const tokenInventariante = tokens[0]!
  const tokenComprador     = tokens[1]!
  const tokenAdmin         = tokens[2]!
  const tokenRoberto       = tokens[3]!
  const tokenClaudia       = tokens[4]!
  const tokenEduardo       = tokens[5]!
  const tokenAna           = tokens[6]!
  const tokenBruno         = tokens[7]!
  const tokenFernanda      = tokens[8]!
  const tokenCarlos        = tokens[9]!
  const tokenRafael        = tokens[10]!
  const tokenPatricia      = tokens[11]!
  console.log('Todos os tokens obtidos.\n')

  console.log('Criando categorias...')
  const [catEletronicos, catMoveis, catEPI, catPapelaria, catLimpeza] = await Promise.all([
    post<{ id: string }>('/categorias', tokenAdmin, { nome: 'Eletrônicos',  descricao: 'Equipamentos eletrônicos e periféricos' }),
    post<{ id: string }>('/categorias', tokenAdmin, { nome: 'Móveis',       descricao: 'Móveis e equipamentos de escritório' }),
    post<{ id: string }>('/categorias', tokenAdmin, { nome: 'EPI',          descricao: 'Equipamentos de proteção individual' }),
    post<{ id: string }>('/categorias', tokenAdmin, { nome: 'Papelaria',    descricao: 'Materiais de escritório e papelaria' }),
    post<{ id: string }>('/categorias', tokenAdmin, { nome: 'Limpeza',      descricao: 'Produtos de limpeza e higiene' }),
  ])
  console.log('5 categorias criadas.\n')

  console.log('Criando fornecedores...')
  const [fornTech, fornOffice, fornSeguranca] = await Promise.all([
    post<{ id: string }>('/fornecedores', tokenAdmin, {
      nome: 'TechSupply Ltda',       cnpj: '12.345.678/0001-90', email: 'contato@techsupply.com.br',  telefone: '(11) 3000-1000',
    }),
    post<{ id: string }>('/fornecedores', tokenAdmin, {
      nome: 'Office Max Brasil',     cnpj: '98.765.432/0001-10', email: 'vendas@officemax.com.br',    telefone: '(11) 3000-2000',
    }),
    post<{ id: string }>('/fornecedores', tokenAdmin, {
      nome: 'Segurança Total S.A.',  cnpj: '11.222.333/0001-44', email: 'pedidos@segurancatotal.com', telefone: '(11) 3000-3000',
    }),
  ])
  console.log('3 fornecedores criados.\n')

  // ── O.C. Bootstrap (carga inicial do inventário) ──────────────────────────────
  // Ana (USUARIO/ADMINISTRACAO) cria → Roberto (GESTOR/ADMINISTRACAO) aprova →
  // Luciana (COMPRADOR) executa → ocNumero fica com status COMPRADO
  console.log('Criando O.C. de bootstrap para carga do inventário...')
  const ocBootstrap = await post<{ id: string; acNumero: string; ocNumero: string }>('/compras', tokenAna, {
    fornecedorId: fornTech.id,
    justificativa: 'Compra inicial para carga do inventário do sistema',
    observacoes: 'O.C. de bootstrap — gerada pelo seed',
    itens: [
      { nomeProduto: 'Notebook Dell Inspiron 15',      quantidade: 3,  precoEstimado: 4500.00 },
      { nomeProduto: 'Monitor LG 24" Full HD',         quantidade: 4,  precoEstimado: 1200.00 },
      { nomeProduto: 'Teclado USB Sem Fio',            quantidade: 5,  precoEstimado: 180.00  },
      { nomeProduto: 'Mouse Óptico USB',               quantidade: 6,  precoEstimado: 80.00   },
      { nomeProduto: 'Cadeira Ergonômica',             quantidade: 4,  precoEstimado: 850.00  },
      { nomeProduto: 'Mesa de Trabalho 1,50m',         quantidade: 2,  precoEstimado: 650.00  },
      { nomeProduto: 'Capacete de Segurança',          quantidade: 10, precoEstimado: 45.00   },
      { nomeProduto: 'Luva de Proteção Nitrílica',     quantidade: 20, precoEstimado: 32.00   },
      { nomeProduto: 'Resma de Papel A4 500fls',       quantidade: 15, precoEstimado: 25.90   },
      { nomeProduto: 'Caneta Esferográfica Azul',      quantidade: 10, precoEstimado: 18.50   },
      { nomeProduto: 'Detergente Neutro 5L',           quantidade: 8,  precoEstimado: 22.00   },
      { nomeProduto: 'Papel Toalha Rolo Industrial',   quantidade: 12, precoEstimado: 35.00   },
    ],
  })
  await post(`/compras/${ocBootstrap.id}/aprovar`, tokenRoberto, { formaPagamento: 'PIX', parcelas: 0 })
  await post(`/compras/${ocBootstrap.id}/executar`, tokenComprador, {})
  console.log(`O.C. bootstrap criada: ${ocBootstrap.ocNumero}\n`)

  console.log('Registrando itens no inventário (como INVENTARIANTE)...')
  const ocNumero = ocBootstrap.ocNumero

  type ItemArray = Array<{ id: string; numero: string }>

  const [
    iNoteBooks, iMonitors, iTeclados, iMouses,
    iCadeiras, iMesas,
    iCapacetes, iLuvas,
    iResmas, iCanetas,
    iDetergentes, iPapelToalha,
  ] = await Promise.all([
    // Eletrônicos
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Notebook Dell Inspiron 15', sku: 'ELE-NOTE-001', unidade: 'UN',
      quantidade: 3, estoqueMinimo: 1, categoriaId: catEletronicos.id, ocNumero,
      descricao: 'Notebook para uso corporativo',
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Monitor LG 24" Full HD', sku: 'ELE-MON-001', unidade: 'UN',
      quantidade: 4, estoqueMinimo: 1, categoriaId: catEletronicos.id, ocNumero,
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Teclado USB Sem Fio', sku: 'ELE-TEC-001', unidade: 'UN',
      quantidade: 5, estoqueMinimo: 2, categoriaId: catEletronicos.id, ocNumero,
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Mouse Óptico USB', sku: 'ELE-MOU-001', unidade: 'UN',
      quantidade: 6, estoqueMinimo: 2, categoriaId: catEletronicos.id, ocNumero,
    }),
    // Móveis
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Cadeira Ergonômica', sku: 'MOV-CAD-001', unidade: 'UN',
      quantidade: 4, estoqueMinimo: 1, categoriaId: catMoveis.id, ocNumero,
      descricao: 'Cadeira com ajuste lombar e apoio de braço',
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Mesa de Trabalho 1,50m', sku: 'MOV-MES-001', unidade: 'UN',
      quantidade: 2, estoqueMinimo: 1, categoriaId: catMoveis.id, ocNumero,
    }),
    // EPI
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Capacete de Segurança', sku: 'EPI-CAP-001', unidade: 'UN',
      quantidade: 10, estoqueMinimo: 3, categoriaId: catEPI.id, ocNumero,
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Luva de Proteção Nitrílica', sku: 'EPI-LUV-001', unidade: 'CX',
      quantidade: 20, estoqueMinimo: 5, categoriaId: catEPI.id, ocNumero,
      descricao: 'Caixa com 100 pares',
    }),
    // Papelaria
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Resma de Papel A4 500fls', sku: 'PAP-RES-001', unidade: 'CX',
      quantidade: 15, estoqueMinimo: 4, categoriaId: catPapelaria.id, ocNumero,
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Caneta Esferográfica Azul', sku: 'PAP-CAN-001', unidade: 'CX',
      quantidade: 10, estoqueMinimo: 2, categoriaId: catPapelaria.id, ocNumero,
      descricao: 'Caixa com 50 unidades',
    }),
    // Limpeza
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Detergente Neutro 5L', sku: 'LIM-DET-001', unidade: 'UN',
      quantidade: 8, estoqueMinimo: 2, categoriaId: catLimpeza.id, ocNumero,
    }),
    post<ItemArray>('/inventario', tokenInventariante, {
      nome: 'Papel Toalha Rolo Industrial', sku: 'LIM-PAP-001', unidade: 'PC',
      quantidade: 12, estoqueMinimo: 3, categoriaId: catLimpeza.id, ocNumero,
    }),
  ])

  const totalItens = [
    iNoteBooks, iMonitors, iTeclados, iMouses,
    iCadeiras, iMesas,
    iCapacetes, iLuvas,
    iResmas, iCanetas,
    iDetergentes, iPapelToalha,
  ].reduce((acc, arr) => acc + arr.length, 0)

  console.log(`${totalItens} unidades registradas no inventário.\n`)

  // ── Solicitações de Compra (demo — ficam PENDENTE para testar aprovação) ──────
  console.log('Criando solicitações de compra (A.C) para testes...')
  const [compraAna1, compraAna2, compraBruno, compraFernanda] = await Promise.all([
    // Ana — ADMINISTRACAO
    post<{ id: string; acNumero: string; ocNumero: string; status: string }>('/compras', tokenAna, {
      fornecedorId: fornOffice.id,
      justificativa: 'Reposição de material de escritório para o setor',
      observacoes: 'Entrega no almoxarifado até sexta-feira',
      itens: [
        { nomeProduto: 'Resma de Papel A4',         quantidade: 10, precoEstimado: 25.90 },
        { nomeProduto: 'Caneta Esferográfica Azul', quantidade: 5,  precoEstimado: 18.50 },
      ],
    }),
    post<{ id: string; acNumero: string; ocNumero: string; status: string }>('/compras', tokenAna, {
      justificativa: 'Aquisição de cadeiras para nova estação de trabalho',
      itens: [
        { nomeProduto: 'Cadeira Ergonômica Presidente', quantidade: 3, precoEstimado: 850.00 },
      ],
    }),
    // Bruno — RECURSOS_HUMANOS
    post<{ id: string; acNumero: string; ocNumero: string; status: string }>('/compras', tokenBruno, {
      fornecedorId: fornSeguranca.id,
      justificativa: 'Reposição de EPIs para equipe de campo',
      itens: [
        { nomeProduto: 'Capacete de Segurança',      quantidade: 15, precoEstimado: 45.00 },
        { nomeProduto: 'Luva de Proteção Nitrílica', quantidade: 20, precoEstimado: 32.00 },
      ],
    }),
    // Fernanda — TECNOLOGIA_INFORMACAO
    post<{ id: string; acNumero: string; ocNumero: string; status: string }>('/compras', tokenFernanda, {
      fornecedorId: fornTech.id,
      justificativa: 'Upgrade de equipamentos para o time de desenvolvimento',
      observacoes: 'Prioridade alta — impacta produtividade do time',
      itens: [
        { nomeProduto: 'Notebook Dell Inspiron 15', quantidade: 2, precoEstimado: 4500.00 },
        { nomeProduto: 'Monitor LG 24" Full HD',    quantidade: 4, precoEstimado: 1200.00 },
        { nomeProduto: 'Teclado USB Sem Fio',       quantidade: 2, precoEstimado: 180.00  },
      ],
    }),
  ])
  console.log('4 solicitações de compra criadas.\n')

  // ── Variação de status das A.C. de demonstração ───────────────────────────────
  // compraAna1   → COMPRADO  (Roberto aprova / Luciana executa)
  // compraBruno  → COMPRADO  (Claudia aprova / Luciana executa)
  // compraFernanda → APROVADO (Eduardo aprova, aguardando execução)
  // compraAna2   → REJEITADO (Roberto rejeita)
  console.log('Atualizando status das A.C. de demonstração...')
  await Promise.all([
    post(`/compras/${compraAna1.id}/aprovar`, tokenRoberto, { formaPagamento: 'BOLETO', parcelas: 0 })
      .then(() => post(`/compras/${compraAna1.id}/executar`, tokenComprador, { valorTotal: 259.00 })),
    post(`/compras/${compraBruno.id}/aprovar`, tokenClaudia, { formaPagamento: 'PIX', parcelas: 0 })
      .then(() => post(`/compras/${compraBruno.id}/executar`, tokenComprador, { valorTotal: 1315.00 })),
    post(`/compras/${compraFernanda.id}/aprovar`, tokenEduardo, { formaPagamento: 'CARTAO_CREDITO', parcelas: 3 }),
    post(`/compras/${compraAna2.id}/rejeitar`, tokenRoberto, {
      motivoRejeicao: 'Orçamento indisponível para aquisição de móveis neste trimestre',
    }),
  ])
  console.log('Status das A.C. atualizados.\n')

  // ── EstoqueSetor: destinação de itens para os setores ─────────────────────────
  // Subtrai do estoque geral e registra movimentação DESTINACAO + EstoqueSetor
  console.log('Destinando itens para os setores...')
  const destinar = (numeroInventario: string, setor: string) =>
    post('/inventario/destinar', tokenInventariante, { numeroInventario, setor, quantidade: 1 })

  await Promise.all([
    // Eletrônicos → TECNOLOGIA_INFORMACAO (2 notebooks, 2 monitores, 2 teclados, 2 mouses)
    destinar(iNoteBooks[0]!.numero,   'TECNOLOGIA_INFORMACAO'),
    destinar(iNoteBooks[1]!.numero,   'TECNOLOGIA_INFORMACAO'),
    destinar(iMonitors[0]!.numero,    'TECNOLOGIA_INFORMACAO'),
    destinar(iMonitors[1]!.numero,    'TECNOLOGIA_INFORMACAO'),
    destinar(iTeclados[0]!.numero,    'TECNOLOGIA_INFORMACAO'),
    destinar(iTeclados[1]!.numero,    'TECNOLOGIA_INFORMACAO'),
    destinar(iMouses[0]!.numero,      'TECNOLOGIA_INFORMACAO'),
    destinar(iMouses[1]!.numero,      'TECNOLOGIA_INFORMACAO'),
    // Móveis → setores distintos (1 cadeira cada)
    destinar(iCadeiras[0]!.numero,    'ADMINISTRACAO'),
    destinar(iCadeiras[1]!.numero,    'RECURSOS_HUMANOS'),
    // EPI → ADMINISTRACAO (3 capacetes, 3 luvas)
    destinar(iCapacetes[0]!.numero,   'ADMINISTRACAO'),
    destinar(iCapacetes[1]!.numero,   'ADMINISTRACAO'),
    destinar(iCapacetes[2]!.numero,   'ADMINISTRACAO'),
    destinar(iLuvas[0]!.numero,       'ADMINISTRACAO'),
    destinar(iLuvas[1]!.numero,       'ADMINISTRACAO'),
    destinar(iLuvas[2]!.numero,       'ADMINISTRACAO'),
    // Papelaria → setores distintos
    destinar(iResmas[0]!.numero,      'ADMINISTRACAO'),
    destinar(iResmas[1]!.numero,      'ADMINISTRACAO'),
    destinar(iResmas[2]!.numero,      'ADMINISTRACAO'),
    destinar(iCanetas[0]!.numero,     'RECURSOS_HUMANOS'),
    destinar(iCanetas[1]!.numero,     'RECURSOS_HUMANOS'),
    // Limpeza → TECNOLOGIA_INFORMACAO (1 detergente, 2 papéis toalha)
    destinar(iDetergentes[0]!.numero,  'TECNOLOGIA_INFORMACAO'),
    destinar(iPapelToalha[0]!.numero,  'TECNOLOGIA_INFORMACAO'),
    destinar(iPapelToalha[1]!.numero,  'TECNOLOGIA_INFORMACAO'),
  ])
  console.log('24 destinações realizadas.\n')

  // Cobrem todos os status: PENDENTE, APROVADO, REJEITADO, PAGO
  console.log('Criando reembolsos (demo)...')
  type ReembolsoResp = { id: string }
  const [reembolsoAna, reembolsoFernanda, reembolsoBruno, reembolsoCarlos] = await Promise.all([
    // Ana — vinculado à compraAna1 (já COMPRADO) → será PAGO
    post<ReembolsoResp>('/reembolsos', tokenAna, {
      solicitacaoCompraId: compraAna1.id,
      valor: 259.00,
      descricao: 'Reembolso pela compra de papelaria executada pessoalmente antes da abertura da A.C.',
      nfe: '35260198765432000110550010000001231234567890',
      dataEmissao: '2026-03-10T10:00:00.000Z',
      cnpjFornecedor: '98.765.432/0001-10',
      observacoes: 'Nota fiscal física entregue ao departamento financeiro',
    }),
    // Fernanda — avulso → fica PENDENTE
    post<ReembolsoResp>('/reembolsos', tokenFernanda, {
      valor: 87.50,
      descricao: 'Reembolso de cabos e adaptadores adquiridos para manutenção emergencial de servidor',
      observacoes: 'Compra realizada sem tempo hábil para abertura de A.C. — urgência técnica',
    }),
    // Bruno — avulso → será REJEITADO
    post<ReembolsoResp>('/reembolsos', tokenBruno, {
      valor: 320.00,
      descricao: 'Reembolso de EPI adquirido em fornecedor não homologado para reposição emergencial',
      cnpjFornecedor: '44.555.666/0001-77',
      observacoes: 'Compra de emergência — estoque crítico de EPIs para equipe de campo',
    }),
    // Carlos — avulso → será APROVADO (aguardando pagamento)
    post<ReembolsoResp>('/reembolsos', tokenCarlos, {
      valor: 150.00,
      descricao: 'Reembolso de ferramentas de manutenção adquiridas para reparo urgente de equipamento',
      nfe: '35260199887766000180550010000005671234567890',
      dataEmissao: '2026-03-20T14:30:00.000Z',
      observacoes: 'Reparo emergencial no servidor de produção — downtime crítico evitado',
    }),
  ])
  console.log('4 reembolsos criados. Processando status...')

  await Promise.all([
    // Ana → PAGO: aprovar (Roberto) → processar (Admin)
    post(`/reembolsos/${reembolsoAna.id}/aprovar`, tokenRoberto, {})
      .then(() => post(`/reembolsos/${reembolsoAna.id}/processar`, tokenAdmin, {})),
    // Bruno → REJEITADO (Eduardo)
    post(`/reembolsos/${reembolsoBruno.id}/rejeitar`, tokenEduardo, {
      motivoRejeicao: 'Fornecedor não homologado — necessário cadastrar o fornecedor previamente e abrir A.C.',
    }),
    // Carlos → APROVADO (Roberto, aguardando pagamento)
    post(`/reembolsos/${reembolsoCarlos.id}/aprovar`, tokenRoberto, {}),
  ])
  console.log('Status dos reembolsos atualizados.\n')

  // Cobrem todos os status: PENDENTE, APROVADO_TECNICO, APROVADO_GESTOR, CONCLUIDO, REJEITADO
  // Itens usados não se sobrepõem com os destinados — estoqueAtual=1 garantido na criação
  console.log('Criando baixas de material (demo)...')
  type BaixaResp = { id: string }

  const [baixa1, baixa2, baixa3, baixa4, baixa5] = await Promise.all([
    // Baixa 1 — Ana (USUARIO) → pipeline completo → CONCLUIDO
    post<BaixaResp>('/baixas', tokenAna, {
      justificativa: 'Capacete com trinca estrutural identificada em vistoria de segurança periódica',
      observacoes: 'Item inutilizável — descartado conforme procedimento NR-6',
      itens: [
        { numeroInventario: iCapacetes[3]!.numero, quantidade: 1, motivo: 'QUEBRA'     },
        { numeroInventario: iLuvas[3]!.numero,     quantidade: 1, motivo: 'VENCIMENTO' },
      ],
    }),
    // Baixa 2 — Fernanda (USUARIO) → APROVADO_GESTOR (aguardando execução)
    post<BaixaResp>('/baixas', tokenFernanda, {
      justificativa: 'Teclado com teclas inoperantes e mouse com botão principal com falha intermitente',
      itens: [
        { numeroInventario: iTeclados[2]!.numero, quantidade: 1, motivo: 'QUEBRA'       },
        { numeroInventario: iMouses[2]!.numero,   quantidade: 1, motivo: 'OBSOLESCENCIA'},
      ],
    }),
    // Baixa 3 — Bruno (USUARIO) → APROVADO_TECNICO (aguardando gestor)
    post<BaixaResp>('/baixas', tokenBruno, {
      justificativa: 'Resmas de papel com danos por umidade e canetas ressecadas do lote antigo',
      itens: [
        { numeroInventario: iResmas[3]!.numero,  quantidade: 1, motivo: 'VENCIMENTO' },
        { numeroInventario: iCanetas[2]!.numero, quantidade: 1, motivo: 'OUTROS'     },
      ],
    }),
    // Baixa 4 — Ana (USUARIO) → REJEITADO (gestor solicita inspeção)
    post<BaixaResp>('/baixas', tokenAna, {
      justificativa: 'Detergente com embalagem violada encontrado no almoxarifado durante inventário',
      itens: [
        { numeroInventario: iDetergentes[1]!.numero, quantidade: 1, motivo: 'PERDA' },
      ],
    }),
    // Baixa 5 — Carlos (TECNICO) → PENDENTE (recém aberta)
    post<BaixaResp>('/baixas', tokenCarlos, {
      justificativa: 'Monitor com tela quebrada após queda acidental durante manutenção preventiva',
      itens: [
        { numeroInventario: iMonitors[2]!.numero, quantidade: 1, motivo: 'QUEBRA' },
      ],
    }),
  ])
  console.log('5 baixas criadas. Processando pipelines...')

  // Pipelines independentes executados em paralelo
  await Promise.all([
    // Baixa 1: PENDENTE → APROVADO_TECNICO (Carlos) → APROVADO_GESTOR (Roberto) → CONCLUIDO (Inventariante)
    (async () => {
      await post(`/baixas/${baixa1.id}/aprovar-tecnico`, tokenCarlos, {})
      await post(`/baixas/${baixa1.id}/aprovar-gestor`, tokenRoberto, {})
      await post(`/baixas/${baixa1.id}/executar`, tokenInventariante, {})
    })(),
    // Baixa 2: PENDENTE → APROVADO_TECNICO (Rafael) → APROVADO_GESTOR (Eduardo)
    (async () => {
      await post(`/baixas/${baixa2.id}/aprovar-tecnico`, tokenRafael, {})
      await post(`/baixas/${baixa2.id}/aprovar-gestor`, tokenEduardo, {})
    })(),
    // Baixa 3: PENDENTE → APROVADO_TECNICO (Patricia)
    post(`/baixas/${baixa3.id}/aprovar-tecnico`, tokenPatricia, {}),
    // Baixa 4: PENDENTE → REJEITADO (Roberto)
    post(`/baixas/${baixa4.id}/rejeitar`, tokenRoberto, {
      motivoRejeicao: 'Item aparentemente utilizável — solicitar laudo de inspeção técnica antes do descarte',
    }),
  ])
  console.log('Pipelines das baixas processados.\n')

  console.log('✅ Seed concluído com sucesso!\n')

  const col = {
    perfil: Math.max(...CREDENCIAIS.map(c => c.perfil.length)),
    setor:  Math.max(...CREDENCIAIS.map(c => c.setor.length)),
    email:  Math.max(...CREDENCIAIS.map(c => c.email.length)),
  }
  const linha = (perfil: string, setor: string, email: string, senha: string) =>
    `  ${perfil.padEnd(col.perfil)}  ${setor.padEnd(col.setor)}  ${email.padEnd(col.email)}  ${senha}`
  const sep = `  ${'-'.repeat(col.perfil)}  ${'-'.repeat(col.setor)}  ${'-'.repeat(col.email)}  ${'-'.repeat(SENHA.length)}`

  console.log('── USUÁRIOS ────────────────────────────────────────────────────────')
  console.log(linha('PERFIL', 'SETOR', 'EMAIL', 'SENHA'))
  console.log(sep)
  for (const c of CREDENCIAIS) console.log(linha(c.perfil, c.setor, c.email, c.password))

  console.log('\n── CATEGORIAS ──────────────────────────────────────────────────────')
  console.log(`Eletrônicos  : ${catEletronicos.id}`)
  console.log(`Móveis       : ${catMoveis.id}`)
  console.log(`EPI          : ${catEPI.id}`)
  console.log(`Papelaria    : ${catPapelaria.id}`)
  console.log(`Limpeza      : ${catLimpeza.id}`)

  console.log('\n── FORNECEDORES ────────────────────────────────────────────────────')
  console.log(`TechSupply   : ${fornTech.id}`)
  console.log(`Office Max   : ${fornOffice.id}`)
  console.log(`Seg. Total   : ${fornSeguranca.id}`)

  console.log('\n── INVENTÁRIO ──────────────────────────────────────────────────────')
  const resumoItens: Array<{ label: string; itens: ItemArray }> = [
    { label: 'Notebook Dell   ', itens: iNoteBooks   },
    { label: 'Monitor LG      ', itens: iMonitors    },
    { label: 'Teclado USB     ', itens: iTeclados    },
    { label: 'Mouse Óptico    ', itens: iMouses      },
    { label: 'Cadeira Ergon.  ', itens: iCadeiras    },
    { label: 'Mesa 1,50m      ', itens: iMesas       },
    { label: 'Capacete Seg.   ', itens: iCapacetes   },
    { label: 'Luva Nitrílica  ', itens: iLuvas       },
    { label: 'Resma Papel A4  ', itens: iResmas      },
    { label: 'Caneta Azul     ', itens: iCanetas     },
    { label: 'Detergente 5L   ', itens: iDetergentes },
    { label: 'Papel Toalha    ', itens: iPapelToalha },
  ]
  for (const { label, itens } of resumoItens) {
    const primeiro = itens[0]!.numero
    const sufixo   = itens.length > 1 ? ` … ${itens[itens.length - 1]!.numero}  (${itens.length} un.)` : ''
    console.log(`  ${label}: ${primeiro}${sufixo}`)
  }

  console.log('\n── SOLICITAÇÕES DE COMPRA (status final) ───────────────────────────')
  console.log(`  ${compraAna1.acNumero}   Ana   [papelaria]   → COMPRADO  : ${compraAna1.id}`)
  console.log(`  ${compraAna2.acNumero}   Ana   [móveis]      → REJEITADO : ${compraAna2.id}`)
  console.log(`  ${compraBruno.acNumero}   Bruno [EPIs]        → COMPRADO  : ${compraBruno.id}`)
  console.log(`  ${compraFernanda.acNumero}   Fern. [tecnologia]  → APROVADO  : ${compraFernanda.id}`)

  console.log('\n── ESTOQUE POR SETOR (amostras) ────────────────────────────────────')
  console.log('  TECNOLOGIA_INFORMACAO : 2 notebooks, 2 monitores, 2 teclados, 2 mouses, 1 detergente, 2 papéis toalha')
  console.log('  ADMINISTRACAO         : 1 cadeira, 3 capacetes, 3 luvas, 3 resmas')
  console.log('  RECURSOS_HUMANOS      : 1 cadeira, 2 canetas')

  console.log('\n── REEMBOLSOS ──────────────────────────────────────────────────────')
  console.log(`  ${reembolsoAna.id}    Ana    [vinc. A.C.]  → PAGO`)
  console.log(`  ${reembolsoFernanda.id}    Fern.  [avulso]     → PENDENTE`)
  console.log(`  ${reembolsoBruno.id}    Bruno  [avulso]     → REJEITADO`)
  console.log(`  ${reembolsoCarlos.id}    Carlos [avulso]     → APROVADO`)

  console.log('\n── BAIXAS ──────────────────────────────────────────────────────────')
  console.log(`  ${baixa1.id}    Ana    [EPI]        → CONCLUIDO`)
  console.log(`  ${baixa2.id}    Fern.  [eletrôn.]   → APROVADO_GESTOR`)
  console.log(`  ${baixa3.id}    Bruno  [papelaria]  → APROVADO_TECNICO`)
  console.log(`  ${baixa4.id}    Ana    [limpeza]    → REJEITADO`)
  console.log(`  ${baixa5.id}    Carlos [eletrôn.]   → PENDENTE`)
}

main()
  .catch((err) => {
    console.error('Erro no seed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
