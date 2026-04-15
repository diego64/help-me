import { config } from 'dotenv'
config({ path: '.env' })

import { PrismaClient, Regra } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hashPassword } from '../src/shared/config/password'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

const SENHA = 'HelpMe@1234'

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
  roberto:  'cmn0t3cqp0009iwn3x1abc123',
  claudia:  'cmn0t3cqz0010iwn3y2def456',
  eduardo:  'cmn0t3cr90011iwn3z3ghi789',
  luciana:  'cmn0t3crj0012iwn3a4jkl012',
  rodrigo:  'cmn0t3crt0013iwn3b5mno345',
}

const usuarios = [
  { id: IDS.diego,    nome: 'Diego',    sobrenome: 'Ferreira', email: 'diego.admin@helpme.com',               regra: Regra.ADMIN,         setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.marcos,   nome: 'Marcos',   sobrenome: 'Oliveira', email: 'marcos.admin@helpme.com',              regra: Regra.ADMIN,         setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.juliana,  nome: 'Juliana',  sobrenome: 'Santos',   email: 'juliana.admin@helpme.com',             regra: Regra.ADMIN,         setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.carlos,   nome: 'Carlos',   sobrenome: 'Mendes',   email: 'carlos.tecnico@helpme.com',            regra: Regra.TECNICO,       setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.rafael,   nome: 'Rafael',   sobrenome: 'Lima',     email: 'rafael.tecnico@helpme.com',            regra: Regra.TECNICO,       setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.patricia, nome: 'Patricia', sobrenome: 'Costa',    email: 'patricia.tecnico@helpme.com',          regra: Regra.TECNICO,       setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.ana,      nome: 'Ana',      sobrenome: 'Paula',    email: 'ana.usuario@helpme.com',               regra: Regra.USUARIO,       setor: 'ADMINISTRACAO'         },
  { id: IDS.bruno,    nome: 'Bruno',    sobrenome: 'Alves',    email: 'bruno.usuario@helpme.com',             regra: Regra.USUARIO,       setor: 'RECURSOS_HUMANOS'      },
  { id: IDS.fernanda, nome: 'Fernanda', sobrenome: 'Rocha',    email: 'fernanda.usuario@helpme.com',          regra: Regra.USUARIO,       setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.roberto,  nome: 'Roberto',  sobrenome: 'Souza',    email: 'roberto.gestor@helpme.com',            regra: Regra.GESTOR,        setor: 'ADMINISTRACAO'         },
  { id: IDS.claudia,  nome: 'Claudia',  sobrenome: 'Nunes',    email: 'claudia.gestor@helpme.com',            regra: Regra.GESTOR,        setor: 'RECURSOS_HUMANOS'      },
  { id: IDS.eduardo,  nome: 'Eduardo',  sobrenome: 'Batista',  email: 'eduardo.gestor@helpme.com',            regra: Regra.GESTOR,        setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.luciana,  nome: 'Luciana',  sobrenome: 'Martins',  email: 'luciana.comprador@helpme.com',         regra: Regra.COMPRADOR,     setor: 'TECNOLOGIA_INFORMACAO' },
  { id: IDS.rodrigo,  nome: 'Rodrigo',  sobrenome: 'Campos',   email: 'rodrigo.inventariante@helpme.com',     regra: Regra.INVENTARIANTE, setor: 'TECNOLOGIA_INFORMACAO' },
]

async function main() {
  console.log('Limpando base de dados...')
  await prisma.auditoriaAuth.deleteMany()
  await prisma.usuario.deleteMany()

  const hash = hashPassword(SENHA)

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where:  { id: u.id },
      update: { password: hash, setor: u.setor, ativo: true, deletadoEm: null },
      create: { ...u, password: hash },
    })
  }

  const col = {
    perfil: Math.max(...usuarios.map(u => u.regra.length)),
    setor:  Math.max(...usuarios.map(u => u.setor.length)),
    email:  Math.max(...usuarios.map(u => u.email.length)),
  }

  const linha = (perfil: string, setor: string, email: string, senha: string) =>
    `  ${perfil.padEnd(col.perfil)}  ${setor.padEnd(col.setor)}  ${email.padEnd(col.email)}  ${senha}`

  const separador = `  ${'-'.repeat(col.perfil)}  ${'-'.repeat(col.setor)}  ${'-'.repeat(col.email)}  ${'-'.repeat(SENHA.length)}`

  console.log()
  console.log(linha('PERFIL', 'SETOR', 'EMAIL', 'SENHA'))
  console.log(separador)
  for (const u of usuarios) {
    console.log(linha(u.regra, u.setor, u.email, SENHA))
  }
  console.log()
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
