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
// FUNÇÃO PARA CRIAR USUÁRIO
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
// FUNÇÃO PRINCIPAL DE SEED
// ============================================================================

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // USUÁRIOS
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

  const usuario = await criarUsuario('user@helpme.com', {
    nome: 'Usuario',
    sobrenome: 'Teste',
    email: 'user@helpme.com',
    password: 'User123!',
    regra: Regra.USUARIO,
    setor: Setor.COMERCIAL,
    telefone: '(11) 99999-0002',
    ramal: '2000',
  });

  const tecnico = await criarUsuario('tecnico@helpme.com', {
    nome: 'Tecnico',
    sobrenome: 'Suporte',
    email: 'tecnico@helpme.com',
    password: 'Tecnico123!',
    regra: Regra.TECNICO,
    setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0003',
    ramal: '3000',
  });

  console.log('[SUCESSO] - Usuários criados:', admin.email, usuario.email, tecnico.email);

  // EXPEDIENTE DO TÉCNICO
  const expedienteId = `${tecnico.id}-expediente`;
  await prisma.expediente.upsert({
    where: { id: expedienteId },
    update: { entrada: '08:00', saida: '17:00' },
    create: { id: expedienteId, usuarioId: tecnico.id, entrada: '08:00', saida: '17:00' },
  });

  console.log('[SUCESSO] - Expediente do técnico configurado: 08:00 - 17:00');

  // SERVIÇOS
  const servicosData = [
    { nome: 'Serviço Teste K6', descricao: 'Serviço para testes automatizados K6', ativo: true },
    { nome: 'Instalação de Software', descricao: 'Instalação e configuração de softwares corporativos', ativo: true },
    { nome: 'Manutenção de Hardware', descricao: 'Reparo e manutenção de equipamentos', ativo: true },
    { nome: 'Suporte de Rede', descricao: 'Configuração e troubleshooting de rede', ativo: true },
    { nome: 'Backup e Recuperação', descricao: 'Serviços de backup e recuperação de dados', ativo: false },
  ];

  for (const dados of servicosData) {
    const servico = await prisma.servico.upsert({
      where: { nome: dados.nome },
      update: { descricao: dados.descricao, ativo: dados.ativo },
      create: dados,
    });
    console.log(`[SUCESSO] Serviço: ${servico.nome} (${servico.ativo ? 'ativo' : 'inativo'})`);
  }

  const servicoTeste = await prisma.servico.findUnique({ where: { nome: 'Serviço Teste K6' } });

  // CHAMADOS
  if (servicoTeste) {
    const jaExistem = await prisma.chamado.findMany({ where: { OS: { in: ['INC0001','INC0002','INC0003'] } } });

    if (jaExistem.length === 0) {
      const chamados = await prisma.$transaction(async (tx) => {
        // ABERTO
        const c1 = await tx.chamado.create({
          data: { OS: 'INC0001', descricao: 'Chamado de teste em aberto', status: ChamadoStatus.ABERTO, usuarioId: usuario.id },
        });
        await tx.ordemDeServico.create({ data: { chamadoId: c1.id, servicoId: servicoTeste.id } });

        // EM ATENDIMENTO
        const c2 = await tx.chamado.create({
          data: { OS: 'INC0002', descricao: 'Chamado em atendimento', status: ChamadoStatus.EM_ATENDIMENTO, usuarioId: usuario.id, tecnicoId: tecnico.id },
        });
        await tx.ordemDeServico.create({ data: { chamadoId: c2.id, servicoId: servicoTeste.id } });

        // ENCERRADO
        const c3 = await tx.chamado.create({
          data: { OS: 'INC0003', descricao: 'Chamado encerrado', descricaoEncerramento: 'Problema resolvido com sucesso', status: ChamadoStatus.ENCERRADO, encerradoEm: new Date(), usuarioId: usuario.id, tecnicoId: tecnico.id },
        });
        await tx.ordemDeServico.create({ data: { chamadoId: c3.id, servicoId: servicoTeste.id } });

        return [c1, c2, c3];
      });

      console.log('[SUCESSO] Chamados criados:', chamados.map(c => c.OS).join(', '));
    } else {
      console.log(`[INFO] Chamados já existiam (${jaExistem.length})`);
    }
  }

  console.log('\n[SUCESSO] Seed concluído com sucesso!\n');
  console.log('Credenciais criadas:');
  console.log('Admin:   admin@helpme.com   | Admin123!');
  console.log('Usuario: user@helpme.com    | User123!');
  console.log('Tecnico: tecnico@helpme.com | Tecnico123!\n');
}

// ============================================================================  
// EXECUÇÃO
// ============================================================================

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
