import { config } from 'dotenv'
config({ path: '.env' })

import { PrismaClient, Regra } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hashPassword } from '../src/shared/config/password'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

const IDS = {
  diego:    'cmn0t3cny0000iwn3k0lbekjz',
  marcos:   'cmn0t3co80001iwn3qd8xm8by',
  juliana:  'cmn0t3cod0002iwn3ba526fbl',
  carlos:   'cmn0t3coj0003iwn3gyhj2uaa',
  rafael:   'cmn0t3coo0004iwn3eyvn7ox5',
  patricia: 'cmn0t3cp10005iwn3vvn49vxw',
  ana:      'cmn0t3cpo0006iwn39qadl56k',
  bruno:    'cmn0t3cpw0007iwn38duvdmiy',
  fernanda: 'cmn0t3cqb0008iwn3hn2hrdl2',
}

async function main() {
  console.log('🌱 Iniciando seed do auth-service...\n')

  console.log('Limpando base de dados...')
  await prisma.auditoriaAuth.deleteMany()
  await prisma.usuario.deleteMany()
  console.log('Base limpa.\n')

  const usuarios = [
    { id: IDS.diego,    nome: 'Diego',    sobrenome: 'Ferreira', email: 'diego.admin@helpme.com',      password: hashPassword('Admin@1234'),   regra: Regra.ADMIN   },
    { id: IDS.marcos,   nome: 'Marcos',   sobrenome: 'Oliveira', email: 'marcos.admin@helpme.com',     password: hashPassword('Admin@1234'),   regra: Regra.ADMIN   },
    { id: IDS.juliana,  nome: 'Juliana',  sobrenome: 'Santos',   email: 'juliana.admin@helpme.com',    password: hashPassword('Admin@1234'),   regra: Regra.ADMIN   },
    { id: IDS.carlos,   nome: 'Carlos',   sobrenome: 'Mendes',   email: 'carlos.tecnico@helpme.com',   password: hashPassword('Tecnico@1234'), regra: Regra.TECNICO },
    { id: IDS.rafael,   nome: 'Rafael',   sobrenome: 'Lima',     email: 'rafael.tecnico@helpme.com',   password: hashPassword('Tecnico@1234'), regra: Regra.TECNICO },
    { id: IDS.patricia, nome: 'Patricia', sobrenome: 'Costa',    email: 'patricia.tecnico@helpme.com', password: hashPassword('Tecnico@1234'), regra: Regra.TECNICO },
    { id: IDS.ana,      nome: 'Ana',      sobrenome: 'Paula',    email: 'ana.usuario@helpme.com',      password: hashPassword('Usuario@1234'), regra: Regra.USUARIO },
    { id: IDS.bruno,    nome: 'Bruno',    sobrenome: 'Alves',    email: 'bruno.usuario@helpme.com',    password: hashPassword('Usuario@1234'), regra: Regra.USUARIO },
    { id: IDS.fernanda, nome: 'Fernanda', sobrenome: 'Rocha',    email: 'fernanda.usuario@helpme.com', password: hashPassword('Usuario@1234'), regra: Regra.USUARIO },
  ]

  for (const dados of usuarios) {
    const usuario = await prisma.usuario.upsert({
      where:  { id: dados.id },
      update: { password: dados.password, ativo: true, deletadoEm: null },
      create: dados,
    })
    console.log(`${usuario.regra.padEnd(8)} → ${usuario.nome} ${usuario.sobrenome} (${usuario.email}) [${usuario.id}]`)
  }

  console.log('\nSeed concluído com sucesso!')
  console.log('\nCredenciais para teste:')
  console.log('\n  ADMIN')
  console.log('   diego.admin@helpme.com      / Admin@1234')
  console.log('   marcos.admin@helpme.com     / Admin@1234')
  console.log('   juliana.admin@helpme.com    / Admin@1234')
  console.log('\n  TECNICO')
  console.log('   carlos.tecnico@helpme.com   / Tecnico@1234')
  console.log('   rafael.tecnico@helpme.com   / Tecnico@1234')
  console.log('   patricia.tecnico@helpme.com / Tecnico@1234')
  console.log('\n  USUARIO')
  console.log('   ana.usuario@helpme.com      / Usuario@1234')
  console.log('   bruno.usuario@helpme.com    / Usuario@1234')
  console.log('   fernanda.usuario@helpme.com / Usuario@1234')
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