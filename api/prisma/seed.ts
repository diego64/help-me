import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sistema.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const newAdmin = await prisma.user.create({
      data: {
        firstName: 'Administrador',
        lastName: 'Sistema',
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    console.log('Admintrator cadastrado com sucesso:');
    console.table({
      Email: newAdmin.email,
      Senha: ADMIN_PASSWORD,
      Role: newAdmin.role,
    });
  } else {
    console.log('Admintrator já cadastrado:', existingAdmin.email);
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
