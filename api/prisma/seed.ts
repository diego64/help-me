import { PrismaClient, Regra, Setor } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

// ============================================================================
// CRIAÇÃO DE USUARIO COM REGRA DE ADMIN
// ============================================================================

  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@helpme.com' },
    update: {
      password: adminPassword,
      ativo: true,
    },
    create: {
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: 'admin@helpme.com',
      password: adminPassword,
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0001',
      ramal: '1000',
      ativo: true,
    },
  });
  console.log('Admin criado:', admin.email);

// ============================================================================
// CRIAÇÃO DE USUARIO COM REGRA DE USUARIO
// ============================================================================

  const userPassword = await bcrypt.hash('User123!', 10);
  const usuario = await prisma.usuario.upsert({
    where: { email: 'user@helpme.com' },
    update: {
      password: userPassword,
      ativo: true,
    },
    create: {
      nome: 'Usuario',
      sobrenome: 'Teste',
      email: 'user@helpme.com',
      password: userPassword,
      regra: Regra.USUARIO,
      setor: Setor.COMERCIAL,
      telefone: '(11) 99999-0002',
      ramal: '2000',
      ativo: true,
    },
  });
  console.log('Usuario criado:', usuario.email);

// ============================================================================
// CRIAÇÃO DE USUARIO COM REGRA DE TECNICO
// ============================================================================

  const tecnicoPassword = await bcrypt.hash('Tecnico123!', 10);
  const tecnico = await prisma.usuario.upsert({
    where: { email: 'tecnico@helpme.com' },
    update: {
      password: tecnicoPassword,
      ativo: true,
    },
    create: {
      nome: 'Tecnico',
      sobrenome: 'Suporte',
      email: 'tecnico@helpme.com',
      password: tecnicoPassword,
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0003',
      ramal: '3000',
      ativo: true,
    },
  });
  console.log('Tecnico criado:', tecnico.email);

// ============================================================================
// CRIAÇÃO DE EXPEDIENTE PARA O TÉCNICO
// ============================================================================

  const expediente = await prisma.expediente.upsert({
    where: { id: tecnico.id + '-expediente' },
    update: {
      entrada: '08:00',
      saida: '17:00',
    },
    create: {
      id: tecnico.id + '-expediente',
      usuarioId: tecnico.id,
      entrada: '08:00',
      saida: '17:00',
    },
  });
  console.log('Expediente do técnico configurado: 08:00 - 17:00');

// ============================================================================
// CRIAÇÃO DE SERVIÇOS
// ============================================================================

  const servicos = [
    {
      nome: 'Serviço Teste K6',
      descricao: 'Serviço para testes automatizados K6',
      ativo: true,
    },
    {
      nome: 'Instalação de Software',
      descricao: 'Instalação e configuração de softwares corporativos',
      ativo: true,
    },
    {
      nome: 'Manutenção de Hardware',
      descricao: 'Reparo e manutenção de equipamentos',
      ativo: true,
    },
    {
      nome: 'Suporte de Rede',
      descricao: 'Configuração e troubleshooting de rede',
      ativo: true,
    },
    {
      nome: 'Backup e Recuperação',
      descricao: 'Serviços de backup e recuperação de dados',
      ativo: false, // Serviço inativo para testes
    },
  ];

  for (const servicoData of servicos) {
    const servico = await prisma.servico.upsert({
      where: { nome: servicoData.nome },
      update: {
        descricao: servicoData.descricao,
        ativo: servicoData.ativo,
      },
      create: servicoData,
    });
    console.log(`Serviço criado: ${servico.nome} (${servico.ativo ? 'ativo' : 'inativo'})`);
  }

// ============================================================================
// CRIAÇÃO DE CHAMADOS
// ============================================================================

  const servicoTeste = await prisma.servico.findUnique({
    where: { nome: 'Serviço Teste K6' },
  });

  if (servicoTeste) {
    // Criar um chamado ABERTO
    const chamadoAberto = await prisma.chamado.create({
      data: {
        OS: 'INC0001',
        descricao: 'Chamado de teste em aberto',
        status: 'ABERTO',
        usuarioId: usuario.id,
      },
    });

    await prisma.ordemDeServico.create({
      data: {
        chamadoId: chamadoAberto.id,
        servicoId: servicoTeste.id,
      },
    });
    console.log('Chamado de teste criado: INC0001 (ABERTO)');

    // STATUS = EM_ATENDIMENTO
    const chamadoEmAtendimento = await prisma.chamado.create({
      data: {
        OS: 'INC0002',
        descricao: 'Chamado em atendimento',
        status: 'EM_ATENDIMENTO',
        usuarioId: usuario.id,
        tecnicoId: tecnico.id,
      },
    });

    await prisma.ordemDeServico.create({
      data: {
        chamadoId: chamadoEmAtendimento.id,
        servicoId: servicoTeste.id,
      },
    });
    console.log('Chamado de teste criado: INC0002 (EM_ATENDIMENTO)');

    // STATUS = ENCERRADO
    const chamadoEncerrado = await prisma.chamado.create({
      data: {
        OS: 'INC0003',
        descricao: 'Chamado já encerrado',
        descricaoEncerramento: 'Problema resolvido com sucesso',
        status: 'ENCERRADO',
        usuarioId: usuario.id,
        tecnicoId: tecnico.id,
        encerradoEm: new Date(),
      },
    });

    await prisma.ordemDeServico.create({
      data: {
        chamadoId: chamadoEncerrado.id,
        servicoId: servicoTeste.id,
      },
    });
    console.log('Chamado de teste criado: INC0003 (ENCERRADO)');
  }

  console.log('\n🎉 Seed concluído com sucesso!\n');
  console.log('   Credenciais criadas:');
  console.log('   Admin:   admin@helpme.com   | Admin123!');
  console.log('   Usuario: user@helpme.com    | User123!');
  console.log('   Tecnico: tecnico@helpme.com | Tecnico123!\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });