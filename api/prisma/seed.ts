import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminExists = await prisma.user.findUnique({ where: { email: 'admin@sistema.com' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    await prisma.user.create({
      data: {
        firstName: 'Administrador',
        lastName: 'Sistema',
        email: 'admin@sistema.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log('Admin criado: admin@sistema.com / Admin123!');
  } else {
    console.log('Admin já existe');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
