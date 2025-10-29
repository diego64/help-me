import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@helpme.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

  const procurarAdministrator = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!procurarAdministrator) {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const newAdmin = await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        sobrenome: 'Sistema',
        email: ADMIN_EMAIL,
        password: hashedPassword,
        regra: 'ADMIN',
      },
    });

    console.log('Admintrator cadastrado com sucesso:');
    console.table({
      Email: newAdmin.email,
      Senha: ADMIN_PASSWORD,
      Regra: newAdmin.regra,
    });
  } else {
    console.log('Admintrator já cadastrado:', procurarAdministrator.email);
  }
}

main()
  .catch((err) => {
    console.error('Erro ao cadastrar Admintrator:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
