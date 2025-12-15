import { PrismaClient, Regra, Setor, ChamadoStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  }),
  log: ['query', 'error', 'warn'],
});

// ============================================================================  
// FUNCAO PARA CRIAR USUARIO
// ============================================================================

async function criarUsuario(email: string, dados: any) {
  const hashed = await bcrypt.hash(dados.password, 10);
  return prisma.usuario.upsert({
    where: { email },
    update: { password: hashed, ativo: true },
    create: { ...dados, password: hashed, ativo: true },
  });
}

// ============================================================================  
// FUNCOES AUXILIARES PARA DADOS ALEATORIOS
// ============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)];
}

// ============================================================================  
// FUNCAO PARA GERAR DATAS COM DISTRIBUICAO INTELIGENTE E GARANTIA UTC
// ============================================================================

function gerarDataInteligente(index: number, total: number): Date {
  const agora = new Date();
  
  // Distribuicao:
  // 40% dos dados: ultimos 7 dias
  // 35% dos dados: 8-30 dias atras
  // 25% dos dados: 31-90 dias atras
  
  const percentual = index / total;
  let data: Date;
  
  if (percentual < 0.40) {
    // 40% nos ultimos 7 dias
    const diasAtras = Math.random() * 7;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  } else if (percentual < 0.75) {
    // 35% entre 8-30 dias atras
    const diasAtras = 8 + Math.random() * 22;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  } else {
    // 25% entre 31-90 dias atras
    const diasAtras = 31 + Math.random() * 59;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  }
  
  // GARANTIR que está no passado (pelo menos 5 minutos atrás)
  if (data.getTime() > agora.getTime() - 5 * 60 * 1000) {
    data = new Date(agora.getTime() - 5 * 60 * 1000);
  }
  
  return data;
}

// ============================================================================  
// DADOS PARA CHAMADOS ALEATORIOS
// ============================================================================

const problemas = [
  'Computador nao liga',
  'Internet lenta',
  'Email nao esta funcionando',
  'Impressora travada',
  'Senha expirada',
  'Sistema nao responde',
  'Erro ao acessar sistema',
  'Telefone sem sinal',
  'Mouse nao funciona',
  'Teclado com teclas travadas',
  'Monitor sem imagem',
  'Aplicativo travando',
  'Erro de acesso negado',
  'Backup nao realizado',
  'VPN nao conecta',
  'Arquivo corrompido',
  'Espaco em disco cheio',
  'Software precisa atualizacao',
  'Configuracao de email',
  'Instalacao de programa',
  'Problema com antivirus',
  'Rede sem internet',
  'Erro no banco de dados',
  'Licenca de software expirada',
  'Periferico USB nao reconhecido',
  'Problema com drivers',
  'Sistema operacional lento',
  'Falha no login',
  'Camera nao funciona',
  'Audio sem som',
  'Projetor sem sinal',
  'Scanner nao digitaliza',
  'Problema com certificado digital',
  'Erro ao imprimir',
  'Notebook superaquecendo',
  'Bateria nao carrega',
  'Configuracao de rede',
  'Problema com Teams/Zoom',
  'Transferencia de arquivos falhou',
  'Acesso remoto nao funciona',
];

const descricoes = [
  'Equipamento apresentando falha desde hoje pela manha',
  'Problema intermitente ao longo do dia',
  'Erro ocorreu apos ultima atualizacao',
  'Nao consigo trabalhar devido ao problema',
  'Urgente! Preciso resolver o quanto antes',
  'Problema comecou ontem a tarde',
  'Equipamento esta inoperante',
  'Tentei reiniciar mas nao resolveu',
  'Mensagem de erro aparece constantemente',
  'Performance muito abaixo do esperado',
  'Ja tentei varias solucoes sem sucesso',
  'Problema afetando toda a equipe',
  'Sistema critico fora do ar',
  'Impossivel realizar minhas atividades',
  'Problema recorrente que precisa solucao definitiva',
  'Equipamento apresenta lentidao extrema',
  'Erro critico no sistema',
  'Necessito suporte tecnico especializado',
  'Problema detectado no inicio do expediente',
  'Falha intermitente dificulta o trabalho',
];

const resolucoes = [
  'Problema resolvido apos reinicializacao do sistema',
  'Configuracao ajustada com sucesso',
  'Software atualizado e testado',
  'Hardware substituido e funcionando normalmente',
  'Usuario orientado sobre procedimento correto',
  'Permissoes de acesso ajustadas',
  'Servico reiniciado e normalizado',
  'Driver atualizado com sucesso',
  'Cabo substituido, equipamento funcionando',
  'Senha redefinida e acesso liberado',
  'Backup realizado e verificado',
  'Limpeza de arquivos temporarios resolveu o problema',
  'Antivirus atualizado e sistema verificado',
  'Conexao de rede reconfigurada',
  'Aplicativo reinstalado corretamente',
  'Problema era configuracao incorreta',
  'Memoria RAM adicionada, sistema mais rapido',
  'Disco rigido substituido por SSD',
  'Licenca renovada e ativada',
  'Problema resolvido remotamente',
];

// ============================================================================  
// FUNCAO PRINCIPAL DE SEED
// ============================================================================

async function main() {
  console.log('Iniciando seed do banco de dados com 9534 chamados...\n');

  // ============================================================================
  // 0. LIMPAR TODA A BASE DE DADOS
  // ============================================================================
  console.log('Limpando base de dados...\n');
  
  try {
    await prisma.ordemDeServico.deleteMany({});
    console.log('   [OK] Ordens de servico removidas');
    
    await prisma.chamado.deleteMany({});
    console.log('   [OK] Chamados removidos');
    
    await prisma.expediente.deleteMany({});
    console.log('   [OK] Expedientes removidos');
    
    await prisma.servico.deleteMany({});
    console.log('   [OK] Servicos removidos');
    
    await prisma.usuario.deleteMany({});
    console.log('   [OK] Usuarios removidos');
    
    console.log('\n[SUCESSO] Base de dados limpa com sucesso!\n');
  } catch (error) {
    console.error('[ERRO] Erro ao limpar base de dados:', error);
    throw error;
  }

  // ============================================================================
  // 1. CRIAR ADMIN
  // ============================================================================
  console.log('Criando Admin...');
  
  const admin = await criarUsuario('admin@helpme.com', {
    nome: 'Admin',
    sobrenome: 'Sistema',
    email: 'admin@helpme.com',
    password: 'Admin123!',
    regra: Regra.ADMIN,
    setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0001',
    ramal: '1000',
  });

  console.log('[OK] Admin criado:', admin.email);

  // ============================================================================
  // 2. CRIAR 5 TECNICOS
  // ============================================================================
  console.log('\nCriando 5 Tecnicos...');
  
  const tecnicosData = [
    { nome: 'Carlos', sobrenome: 'Silva', email: 'carlos.silva@helpme.com', telefone: '(11) 98765-0001', ramal: '3001' },
    { nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com', telefone: '(11) 98765-0002', ramal: '3002' },
    { nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com', telefone: '(11) 98765-0003', ramal: '3003' },
    { nome: 'Juliana', sobrenome: 'Alves', email: 'juliana.alves@helpme.com', telefone: '(11) 98765-0004', ramal: '3004' },
    { nome: 'Fernando', sobrenome: 'Souza', email: 'fernando.souza@helpme.com', telefone: '(11) 98765-0005', ramal: '3005' },
  ];

  const tecnicos = [];
  for (const dados of tecnicosData) {
    const tecnico = await criarUsuario(dados.email, {
      ...dados,
      password: 'Tecnico123!',
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
    });
    tecnicos.push(tecnico);
    console.log(`[OK] Tecnico: ${tecnico.nome} ${tecnico.sobrenome}`);
  }

  for (const tecnico of tecnicos) {
    const expedienteId = `${tecnico.id}-expediente`;
    await prisma.expediente.upsert({
      where: { id: expedienteId },
      update: { entrada: '08:00', saida: '18:00' },
      create: { id: expedienteId, usuarioId: tecnico.id, entrada: '08:00', saida: '18:00' },
    });
  }

  console.log('[OK] Expedientes configurados: 08:00 - 18:00\n');

  // ============================================================================
  // 3. CRIAR 12 USUARIOS (UM PARA CADA SETOR)
  // ============================================================================
  console.log('Criando 12 Usuarios (um por setor)...');
  
  const usuariosData = [
    { nome: 'Joao', sobrenome: 'Oliveira', setor: Setor.ADMINISTRACAO, email: 'joao.oliveira@helpme.com', ramal: '2001' },
    { nome: 'Maria', sobrenome: 'Costa', setor: Setor.ALMOXARIFADO, email: 'maria.costa@helpme.com', ramal: '2002' },
    { nome: 'Pedro', sobrenome: 'Lima', setor: Setor.CALL_CENTER, email: 'pedro.lima@helpme.com', ramal: '2003' },
    { nome: 'Paula', sobrenome: 'Martins', setor: Setor.COMERCIAL, email: 'paula.martins@helpme.com', ramal: '2004' },
    { nome: 'Ricardo', sobrenome: 'Rocha', setor: Setor.DEPARTAMENTO_PESSOAL, email: 'ricardo.rocha@helpme.com', ramal: '2005' },
    { nome: 'Fernanda', sobrenome: 'Mendes', setor: Setor.FINANCEIRO, email: 'fernanda.mendes@helpme.com', ramal: '2006' },
    { nome: 'Lucas', sobrenome: 'Barbosa', setor: Setor.JURIDICO, email: 'lucas.barbosa@helpme.com', ramal: '2007' },
    { nome: 'Camila', sobrenome: 'Ribeiro', setor: Setor.LOGISTICA, email: 'camila.ribeiro@helpme.com', ramal: '2008' },
    { nome: 'Bruno', sobrenome: 'Cardoso', setor: Setor.MARKETING, email: 'bruno.cardoso@helpme.com', ramal: '2009' },
    { nome: 'Aline', sobrenome: 'Pereira', setor: Setor.QUALIDADE, email: 'aline.pereira@helpme.com', ramal: '2010' },
    { nome: 'Rodrigo', sobrenome: 'Dias', setor: Setor.RECURSOS_HUMANOS, email: 'rodrigo.dias@helpme.com', ramal: '2011' },
    { nome: 'Beatriz', sobrenome: 'Araujo', setor: Setor.TECNOLOGIA_INFORMACAO, email: 'beatriz.araujo@helpme.com', ramal: '2012' },
  ];

  const usuarios = [];
  for (const dados of usuariosData) {
    const usuario = await criarUsuario(dados.email, {
      ...dados,
      password: 'User123!',
      regra: Regra.USUARIO,
      telefone: `(11) 97654-${dados.ramal}`,
    });
    usuarios.push(usuario);
    console.log(`[OK] Usuario: ${usuario.nome} ${usuario.sobrenome} (${dados.setor})`);
  }

  // ============================================================================
  // 4. CRIAR SERVICOS
  // ============================================================================
  console.log('\nCriando Servicos...');
  
  const servicosData = [
    { nome: 'Suporte Tecnico Geral', descricao: 'Suporte tecnico para problemas gerais', ativo: true },
    { nome: 'Instalacao de Software', descricao: 'Instalacao e configuracao de softwares', ativo: true },
    { nome: 'Manutencao de Hardware', descricao: 'Reparo e manutencao de equipamentos', ativo: true },
    { nome: 'Suporte de Rede', descricao: 'Configuracao e troubleshooting de rede', ativo: true },
    { nome: 'Backup e Recuperacao', descricao: 'Servicos de backup e recuperacao de dados', ativo: true },
    { nome: 'Configuracao de Email', descricao: 'Configuracao de contas de email', ativo: true },
    { nome: 'Acesso e Permissoes', descricao: 'Gerenciamento de acessos e permissoes', ativo: true },
    { nome: 'Impressoras e Perifericos', descricao: 'Suporte para impressoras e perifericos', ativo: true },
  ];

  const servicos = [];
  for (const dados of servicosData) {
    const servico = await prisma.servico.upsert({
      where: { nome: dados.nome },
      update: { descricao: dados.descricao, ativo: dados.ativo },
      create: dados,
    });
    servicos.push(servico);
    console.log(`[OK] Servico: ${servico.nome}`);
  }

  // ============================================================================
  // 5. CRIAR 9534 CHAMADOS COM DISTRIBUICAO INTELIGENTE
  // ============================================================================
  console.log('\nCriando 9534 chamados com distribuicao inteligente...\n');

  const agora = new Date();
  const data7DiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const data30DiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const data90DiasAtras = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  console.log(`   Distribuicao inteligente de datas:`);
  console.log(`   - 40% ultimos 7 dias  (${data7DiasAtras.toLocaleDateString('pt-BR')} ate hoje)`);
  console.log(`   - 35% entre 8-30 dias (${data30DiasAtras.toLocaleDateString('pt-BR')} ate 7 dias atras)`);
  console.log(`   - 25% entre 31-90 dias (${data90DiasAtras.toLocaleDateString('pt-BR')} ate 30 dias atras)`);
  console.log(`   - GARANTIA: 75% dos dados nos ultimos 30 dias!\n`);

  // Distribuicao de status para 9534 chamados
  const distribuicaoStatus = [
    ...Array(12).fill(ChamadoStatus.ABERTO),
    ...Array(2801).fill(ChamadoStatus.EM_ATENDIMENTO),
    ...Array(5601).fill(ChamadoStatus.ENCERRADO),
    ...Array(784).fill(ChamadoStatus.CANCELADO),
    ...Array(336).fill(ChamadoStatus.REABERTO),
  ];

  let chamadosCriados = 0;
  const totalChamados = 9534;
  const batchSize = 50;
  const totalBatches = Math.ceil(totalChamados / batchSize);

  for (let batch = 0; batch < totalBatches; batch++) {
    const chamadosBatch: { chamadoData: any; servicoId: string; }[] = [];
    const chamadosNesteBatch = Math.min(batchSize, totalChamados - chamadosCriados);
    
    for (let i = 0; i < chamadosNesteBatch; i++) {
      const numero = chamadosCriados + 1;
      const OS = `INC${numero.toString().padStart(6, '0')}`;
      
      const usuario = randomElement(usuarios);
      const status = distribuicaoStatus[chamadosCriados];
      const servico = randomElement(servicos);
      const problema = randomElement(problemas);
      const descricao = `${problema}. ${randomElement(descricoes)}`;
      
      // USAR DISTRIBUICAO INTELIGENTE DE DATAS
      const geradoEm = gerarDataInteligente(chamadosCriados, totalChamados);
      
      const chamadoData: any = {
        OS,
        descricao,
        status,
        usuarioId: usuario.id,
        geradoEm,
      };

      if (status !== ChamadoStatus.ABERTO) {
        chamadoData.tecnicoId = randomElement(tecnicos).id;
        
        const horasAtualizacao = randomInt(1, 48);
        let atualizadoEm = new Date(geradoEm.getTime() + horasAtualizacao * 60 * 60 * 1000);
        
        // GARANTIR QUE NAO ESTA NO FUTURO
        if (atualizadoEm > agora) {
          atualizadoEm = new Date(agora.getTime() - 30 * 60 * 1000);
        }
        
        chamadoData.atualizadoEm = atualizadoEm;
      }

      if (status === ChamadoStatus.ENCERRADO) {
        const horasParaResolver = randomInt(1, 72);
        let encerradoEm = new Date(geradoEm.getTime() + horasParaResolver * 60 * 60 * 1000);
        
        if (encerradoEm > agora) {
          encerradoEm = new Date(agora.getTime() - 15 * 60 * 1000);
        }
        
        chamadoData.encerradoEm = encerradoEm;
        chamadoData.descricaoEncerramento = randomElement(resolucoes);
      } else if (status === ChamadoStatus.CANCELADO) {
        const horasParaCancelar = randomInt(1, 24);
        let encerradoEm = new Date(geradoEm.getTime() + horasParaCancelar * 60 * 60 * 1000);
        
        if (encerradoEm > agora) {
          encerradoEm = new Date(agora.getTime() - 15 * 60 * 1000);
        }
        
        chamadoData.encerradoEm = encerradoEm;
        chamadoData.descricaoEncerramento = 'Chamado cancelado a pedido do usuario';
      }

      chamadosBatch.push({ chamadoData, servicoId: servico.id });
      chamadosCriados++;
    }

    await prisma.$transaction(async (tx) => {
      for (const { chamadoData, servicoId } of chamadosBatch) {
        const chamado = await tx.chamado.create({
          data: chamadoData,
        });

        await tx.ordemDeServico.create({
          data: {
            chamadoId: chamado.id,
            servicoId: servicoId,
          },
        });
      }
    });

    const progresso = ((chamadosCriados / totalChamados) * 100).toFixed(1);
    const barraProgresso = '='.repeat(Math.floor(parseFloat(progresso) / 5));
    const espacos = ' '.repeat(20 - barraProgresso.length);
    console.log(`[${barraProgresso}${espacos}] Lote ${batch + 1}/${totalBatches} | ${chamadosCriados}/${totalChamados} (${progresso}%)`);
  }

  // ============================================================================
  // 6. VALIDACAO DOS DADOS CRIADOS
  // ============================================================================
  console.log('\n[VALIDACAO] Verificando distribuicao dos dados...\n');

  const totalCriados = await prisma.chamado.count();
  console.log(`[CHECK] Total de chamados: ${totalCriados}`);

  const ultimos7Dias = await prisma.chamado.count({
    where: { geradoEm: { gte: data7DiasAtras } }
  });
  console.log(`[CHECK] Ultimos 7 dias: ${ultimos7Dias} (${((ultimos7Dias/totalCriados)*100).toFixed(1)}%)`);

  const ultimos30Dias = await prisma.chamado.count({
    where: { geradoEm: { gte: data30DiasAtras } }
  });
  console.log(`[CHECK] Ultimos 30 dias: ${ultimos30Dias} (${((ultimos30Dias/totalCriados)*100).toFixed(1)}%)`);

  const ultimos90Dias = await prisma.chamado.count({
    where: { geradoEm: { gte: data90DiasAtras } }
  });
  console.log(`[CHECK] Ultimos 90 dias: ${ultimos90Dias} (${((ultimos90Dias/totalCriados)*100).toFixed(1)}%)`);

  const datasFuturas = await prisma.chamado.count({
    where: { geradoEm: { gt: agora } }
  });
  console.log(`[CHECK] Datas futuras: ${datasFuturas} (DEVE SER 0!)\n`);

  // ============================================================================
  // 7. ESTATISTICAS FINAIS
  // ============================================================================
  console.log('Estatisticas dos chamados criados:\n');

  const stats = await prisma.chamado.groupBy({
    by: ['status'],
    _count: true,
  });

  const statsOrdenados = stats.sort((a, b) => {
    const ordem = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO'];
    return ordem.indexOf(a.status) - ordem.indexOf(b.status);
  });

  for (const stat of statsOrdenados) {
    const percentual = ((stat._count / totalChamados) * 100).toFixed(2);
    const espacamento = ' '.repeat(20 - stat.status.length);
    console.log(`   ${stat.status}:${espacamento}${stat._count.toString().padStart(5)} chamados (${percentual.padStart(5)}%)`);
  }

  // ============================================================================
  // RESUMO FINAL
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('SEED CONCLUIDO COM SUCESSO!');
  console.log('='.repeat(80));
  console.log('\n[RESUMO]\n');
  console.log(`   - 1 Admin criado`);
  console.log(`   - 5 Tecnicos criados`);
  console.log(`   - 12 Usuarios criados (um para cada setor)`);
  console.log(`   - ${servicos.length} Servicos criados`);
  console.log(`   - ${totalChamados} Chamados criados`);
  console.log(`\n[DISTRIBUICAO DE DATAS]`);
  console.log(`   - Ultimos 7 dias: ~40% (${ultimos7Dias} chamados)`);
  console.log(`   - Ultimos 30 dias: ~75% (${ultimos30Dias} chamados)`);
  console.log(`   - Ultimos 90 dias: ~100% (${ultimos90Dias} chamados)`);
  console.log(`   - GARANTIA: Dashboard "Last 30 days" tera ${ultimos30Dias} chamados!`);
  console.log(`\n[COMPATIBILIDADE GRAFANA]`);
  console.log(`   - Todas as datas no passado: SIM`);
  console.log(`   - Dados nos ultimos 30 dias: SIM (${ultimos30Dias} chamados)`);
  console.log(`   - Time Range "Last 30 days": FUNCIONARA!`);
  console.log(`   - Time Range "Last 90 days": FUNCIONARA!`);
  console.log('\n' + '='.repeat(80) + '\n');
}

// ============================================================================  
// EXECUCAO
// ============================================================================

main()
  .catch((e) => {
    console.error('[ERRO] Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });