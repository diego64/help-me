import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import { Setor, Regra } from '@prisma/client';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NOME_LENGTH = 2;
const MAX_NOME_LENGTH = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIO_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_ENTRADA = '08:00';
const DEFAULT_SAIDA = '17:00';

// Configuração de upload
const UPLOAD_DIR = 'uploads/avatars';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

interface ListagemResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function converterHorarioParaDateTime(horario: string): Date {
  const [hora, minuto] = horario.split(':').map(Number);
  const date = new Date();
  date.setHours(hora, minuto, 0, 0);
  return date;
}

// ========================================
// CONFIGURAÇÃO DE UPLOAD
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use: JPEG, PNG ou WEBP'));
    }
  },
});

function validarEmail(email: string): { valido: boolean; erro?: string } {
  if (!email || typeof email !== 'string') {
    return { valido: false, erro: 'Email é obrigatório' };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valido: false, erro: 'Email inválido' };
  }

  return { valido: true };
}

function validarSenha(password: string): { valida: boolean; erro?: string } {
  if (!password || typeof password !== 'string') {
    return { valida: false, erro: 'Senha é obrigatória' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valida: false,
      erro: `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }

  return { valida: true };
}

function validarNome(nome: string, campo: string): { valido: boolean; erro?: string } {
  if (!nome || typeof nome !== 'string') {
    return { valido: false, erro: `${campo} é obrigatório` };
  }

  const nomeLimpo = nome.trim();

  if (nomeLimpo.length < MIN_NOME_LENGTH) {
    return {
      valido: false,
      erro: `${campo} deve ter no mínimo ${MIN_NOME_LENGTH} caracteres`,
    };
  }

  if (nomeLimpo.length > MAX_NOME_LENGTH) {
    return {
      valido: false,
      erro: `${campo} deve ter no máximo ${MAX_NOME_LENGTH} caracteres`,
    };
  }

  return { valido: true };
}

function validarHorario(horario: string, campo: string): { valido: boolean; erro?: string } {
  if (!horario || typeof horario !== 'string') {
    return { valido: false, erro: `${campo} é obrigatório` };
  }

  if (!HORARIO_REGEX.test(horario)) {
    return {
      valido: false,
      erro: `${campo} deve estar no formato HH:MM (ex: 08:00)`,
    };
  }

  return { valido: true };
}

function validarIntervaloHorario(entrada: string, saida: string): { valido: boolean; erro?: string } {
  const [entradaH, entradaM] = entrada.split(':').map(Number);
  const [saidaH, saidaM] = saida.split(':').map(Number);

  const entradaMinutos = entradaH * 60 + entradaM;
  const saidaMinutos = saidaH * 60 + saidaM;

  if (saidaMinutos <= entradaMinutos) {
    return {
      valido: false,
      erro: 'Horário de saída deve ser posterior ao horário de entrada',
    };
  }

  return { valido: true };
}

function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): ListagemResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

const TECNICO_SELECT = {
  id: true,
  nome: true,
  sobrenome: true,
  email: true,
  telefone: true,
  ramal: true,
  setor: true,
  avatarUrl: true,
  ativo: true,
  geradoEm: true,
  atualizadoEm: true,
  deletadoEm: true,
  regra: true,
  tecnicoDisponibilidade: {
    where: {
      deletadoEm: null,
    },
    select: {
      id: true,
      entrada: true,
      saida: true,
      ativo: true,
      geradoEm: true,
      atualizadoEm: true,
      deletadoEm: true,
    },
  },
  _count: {
    select: {
      tecnicoChamados: true,
    },
  },
} as const;

/**
 * @swagger
 * tags:
 *   name: Técnicos
 *   description: Gerenciamento de usuários técnicos e seus horários de atendimento
 */

// ========================================
// CRIAÇÃO DE TÉCNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos:
 *   post:
 *     summary: Cria um novo usuário técnico
 *     description: Cadastra um técnico no sistema com perfil TECNICO. Automaticamente cria um horário padrão de expediente (08:00 às 17:00). Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - sobrenome
 *               - email
 *               - password
 *             properties:
 *               nome:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               sobrenome:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               setor:
 *                 type: string
 *                 enum: [ADMINISTRACAO, ALMOXARIFADO, CALL_CENTER, COMERCIAL, DEPARTAMENTO_PESSOAL, FINANCEIRO, JURIDICO, LOGISTICA, MARKETING, QUALIDADE, RECURSOS_HUMANOS, TECNOLOGIA_INFORMACAO]
 *                 default: TECNOLOGIA_INFORMACAO
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               entrada:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *                 default: "08:00"
 *               saida:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *                 default: "17:00"
 *     responses:
 *       201:
 *         description: Técnico criado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       409:
 *         description: Email já cadastrado
 *       500:
 *         description: Erro ao criar técnico
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        nome,
        sobrenome,
        email,
        password,
        setor = Setor.TECNOLOGIA_INFORMACAO,
        telefone,
        ramal,
        entrada = DEFAULT_ENTRADA,
        saida = DEFAULT_SAIDA,
      } = req.body;

      // Validações
      const validacaoNome = validarNome(nome, 'Nome');
      if (!validacaoNome.valido) {
        return res.status(400).json({ error: validacaoNome.erro });
      }

      const validacaoSobrenome = validarNome(sobrenome, 'Sobrenome');
      if (!validacaoSobrenome.valido) {
        return res.status(400).json({ error: validacaoSobrenome.erro });
      }

      const validacaoEmail = validarEmail(email);
      if (!validacaoEmail.valido) {
        return res.status(400).json({ error: validacaoEmail.erro });
      }

      const validacaoSenha = validarSenha(password);
      if (!validacaoSenha.valida) {
        return res.status(400).json({ error: validacaoSenha.erro });
      }

      const validacaoEntrada = validarHorario(entrada, 'Horário de entrada');
      if (!validacaoEntrada.valido) {
        return res.status(400).json({ error: validacaoEntrada.erro });
      }

      const validacaoSaida = validarHorario(saida, 'Horário de saída');
      if (!validacaoSaida.valido) {
        return res.status(400).json({ error: validacaoSaida.erro });
      }

      const validacaoIntervalo = validarIntervaloHorario(entrada, saida);
      if (!validacaoIntervalo.valido) {
        return res.status(400).json({ error: validacaoIntervalo.erro });
      }

      // Verificar se email já existe
      const emailExistente = await prisma.usuario.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, deletadoEm: true },
      });

      if (emailExistente) {
        if (emailExistente.deletadoEm) {
          return res.status(409).json({
            error: 'Já existe um usuário deletado com este email. Restaure ou use outro email.',
          });
        }
        return res.status(409).json({
          error: 'Email já cadastrado',
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Criar técnico e expediente em transação
      const tecnicoId = await prisma.$transaction(async (tx) => {
        const novoTecnico = await tx.usuario.create({
          data: {
            nome: nome.trim(),
            sobrenome: sobrenome.trim(),
            email: email.toLowerCase(),
            password: hashedPassword,
            telefone: telefone?.trim() || null,
            ramal: ramal?.trim() || null,
            regra: Regra.TECNICO,
            setor,
          },
          select: { id: true },
        });

        await tx.expediente.create({
          data: {
            usuarioId: novoTecnico.id,
            entrada: converterHorarioParaDateTime(entrada),
            saida: converterHorarioParaDateTime(saida),
          },
        });

        return novoTecnico.id;
      });

      const tecnico = await prisma.usuario.findUnique({
        where: { id: tecnicoId },
        select: TECNICO_SELECT,
      });

      console.log('[TECNICO CREATED]', {
        id: tecnicoId,
        email: email.toLowerCase(),
      });

      res.status(201).json(tecnico);
    } catch (err: any) {
      console.error('[TECNICO CREATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao criar técnico',
      });
    }
  }
);

// ========================================
// LISTAGEM DE TÉCNICOS (COM PAGINAÇÃO)
// ========================================

/**
 * @swagger
 * /api/tecnicos:
 *   get:
 *     summary: Lista todos os técnicos
 *     description: Retorna todos os usuários com perfil TECNICO, incluindo informações de disponibilidade. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: incluirDeletados
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: setor
 *         schema:
 *           type: string
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de técnicos retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar técnicos
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { incluirInativos, incluirDeletados, setor, busca } = req.query;

      const where: any = {
        regra: Regra.TECNICO,
      };

      if (incluirInativos !== 'true') {
        where.ativo = true;
      }

      if (incluirDeletados !== 'true') {
        where.deletadoEm = null;
      }

      if (setor) {
        where.setor = setor as Setor;
      }

      if (busca && typeof busca === 'string') {
        where.OR = [
          { nome: { contains: busca, mode: 'insensitive' } },
          { sobrenome: { contains: busca, mode: 'insensitive' } },
          { email: { contains: busca, mode: 'insensitive' } },
        ];
      }

      // Buscar em paralelo
      const [total, tecnicos] = await Promise.all([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({
          where,
          select: TECNICO_SELECT,
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(tecnicos, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[TECNICO LIST ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar técnicos',
      });
    }
  }
);

// ========================================
// BUSCAR TÉCNICO POR ID
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   get:
 *     summary: Busca um técnico por ID
 *     description: Retorna os detalhes de um técnico específico. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Técnico encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao buscar técnico
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: TECNICO_SELECT,
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      res.json(tecnico);
    } catch (err: any) {
      console.error('[TECNICO GET ERROR]', err);
      res.status(500).json({
        error: 'Erro ao buscar técnico',
      });
    }
  }
);

// ========================================
// EDIÇÃO DE TÉCNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   put:
 *     summary: Atualiza os dados de um técnico
 *     description: Permite editar informações cadastrais do técnico. Requer autenticação e perfil ADMIN ou o próprio TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               sobrenome:
 *                 type: string
 *               email:
 *                 type: string
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               setor:
 *                 type: string
 *     responses:
 *       200:
 *         description: Técnico atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       409:
 *         description: Email já em uso
 *       500:
 *         description: Erro ao atualizar técnico
 */
router.put(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { nome, sobrenome, email, telefone, ramal, setor } = req.body;

      // Verificar permissão (técnico só pode editar a si mesmo)
      if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode editar seu próprio perfil',
        });
      }

      // Buscar técnico
      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
        },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      if (tecnico.deletadoEm) {
        return res.status(400).json({
          error: 'Não é possível editar um técnico deletado',
        });
      }

      const dataToUpdate: any = {};

      if (nome !== undefined) {
        const validacao = validarNome(nome, 'Nome');
        if (!validacao.valido) {
          return res.status(400).json({ error: validacao.erro });
        }
        dataToUpdate.nome = nome.trim();
      }

      // Validar e atualizar sobrenome
      if (sobrenome !== undefined) {
        const validacao = validarNome(sobrenome, 'Sobrenome');
        if (!validacao.valido) {
          return res.status(400).json({ error: validacao.erro });
        }
        dataToUpdate.sobrenome = sobrenome.trim();
      }

      // Validar e atualizar email
      if (email !== undefined) {
        const validacao = validarEmail(email);
        if (!validacao.valido) {
          return res.status(400).json({ error: validacao.erro });
        }

        const emailLower = email.toLowerCase();

        // Verificar se email já existe (em outro usuário)
        if (emailLower !== tecnico.email) {
          const emailExistente = await prisma.usuario.findUnique({
            where: { email: emailLower },
          });

          if (emailExistente && emailExistente.id !== id) {
            return res.status(409).json({
              error: 'Email já está em uso',
            });
          }

          dataToUpdate.email = emailLower;
        }
      }

      // Atualizar telefone, ramal e setor
      if (telefone !== undefined) {
        dataToUpdate.telefone = telefone?.trim() || null;
      }

      if (ramal !== undefined) {
        dataToUpdate.ramal = ramal?.trim() || null;
      }

      if (setor !== undefined && req.usuario!.regra === Regra.ADMIN) {
        dataToUpdate.setor = setor as Setor;
      }

      // Se nada para atualizar
      if (Object.keys(dataToUpdate).length === 0) {
        const current = await prisma.usuario.findUnique({
          where: { id },
          select: TECNICO_SELECT,
        });
        return res.json(current);
      }

      // Atualizar técnico
      const updated = await prisma.usuario.update({
        where: { id },
        data: dataToUpdate,
        select: TECNICO_SELECT,
      });

      console.log('[TECNICO UPDATED]', { id, email: updated.email });

      res.json(updated);
    } catch (err: any) {
      console.error('[TECNICO UPDATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao atualizar técnico',
      });
    }
  }
);

// ========================================
// ALTERAÇÃO DE SENHA
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/password:
 *   put:
 *     summary: Altera a senha de um técnico
 *     description: Permite redefinir a senha de um técnico. Requer autenticação e perfil ADMIN ou o próprio TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao alterar senha
 */
router.put(
  '/:id/password',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      // Verificar permissão
      if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode alterar sua própria senha',
        });
      }

      // Validar senha
      const validacao = validarSenha(password);
      if (!validacao.valida) {
        return res.status(400).json({ error: validacao.erro });
      }

      // Verificar se técnico existe
      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, regra: true },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      // Hash e atualizar senha
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await prisma.usuario.update({
        where: { id },
        data: { password: hashedPassword },
      });

      console.log('[TECNICO PASSWORD UPDATED]', { id });

      res.json({
        message: 'Senha alterada com sucesso',
      });
    } catch (err: any) {
      console.error('[TECNICO PASSWORD ERROR]', err);
      res.status(500).json({
        error: 'Erro ao alterar senha',
      });
    }
  }
);

// ========================================
// ATUALIZAR HORÁRIOS
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/horarios:
 *   put:
 *     summary: Atualiza o horário de expediente do técnico
 *     description: Define ou atualiza o horário de disponibilidade do técnico. Remove horários anteriores e cria novo expediente. Requer autenticação e perfil ADMIN ou o próprio TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entrada
 *               - saida
 *             properties:
 *               entrada:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *               saida:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *     responses:
 *       200:
 *         description: Horário atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao atualizar horário
 */
router.put(
  '/:id/horarios',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { entrada, saida } = req.body;

      // Verificar permissão
      if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode alterar seus próprios horários',
        });
      }

      // Validar horários
      const validacaoEntrada = validarHorario(entrada, 'Horário de entrada');
      if (!validacaoEntrada.valido) {
        return res.status(400).json({ error: validacaoEntrada.erro });
      }

      const validacaoSaida = validarHorario(saida, 'Horário de saída');
      if (!validacaoSaida.valido) {
        return res.status(400).json({ error: validacaoSaida.erro });
      }

      const validacaoIntervalo = validarIntervaloHorario(entrada, saida);
      if (!validacaoIntervalo.valido) {
        return res.status(400).json({ error: validacaoIntervalo.erro });
      }

      // Verificar se técnico existe
      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, regra: true },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      // Atualizar horários em transação usando DateTime
      const horario = await prisma.$transaction(async (tx) => {
        // Soft delete dos horários antigos
        await tx.expediente.updateMany({
          where: { usuarioId: id },
          data: { deletadoEm: new Date(), ativo: false },
        });

        // Criar novo horário
        return await tx.expediente.create({
          data: {
            usuarioId: id,
            entrada: converterHorarioParaDateTime(entrada),
            saida: converterHorarioParaDateTime(saida),
          },
          select: {
            id: true,
            entrada: true,
            saida: true,
            ativo: true,
            geradoEm: true,
          },
        });
      });

      console.log('[TECNICO HORARIOS UPDATED]', { id, entrada, saida });

      res.json({
        message: 'Horário de disponibilidade atualizado com sucesso',
        horario,
      });
    } catch (err: any) {
      console.error('[TECNICO HORARIOS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao atualizar horários',
      });
    }
  }
);

// ========================================
// UPLOAD DE AVATAR
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil do técnico
 *     description: Permite enviar uma imagem de avatar (JPEG, PNG, WEBP, max 5MB). Requer autenticação e perfil ADMIN ou o próprio TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar enviado com sucesso
 *       400:
 *         description: Arquivo inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post(
  '/:id/avatar',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  upload.single('avatar'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const file = req.file;

      // Verificar permissão
      if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode fazer upload do seu próprio avatar',
        });
      }

      if (!file) {
        return res.status(400).json({
          error: 'Arquivo não enviado',
        });
      }

      // Verificar se técnico existe
      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, regra: true },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      // Atualizar avatarUrl
      const updated = await prisma.usuario.update({
        where: { id },
        data: { avatarUrl: `/uploads/avatars/${file.filename}` },
        select: {
          id: true,
          avatarUrl: true,
        },
      });

      console.log('[TECNICO AVATAR UPLOADED]', {
        id,
        file: file.filename,
      });

      res.json({
        message: 'Avatar enviado com sucesso',
        avatarUrl: updated.avatarUrl,
      });
    } catch (err: any) {
      console.error('[TECNICO AVATAR ERROR]', err);
      res.status(500).json({
        error: 'Erro ao fazer upload do avatar',
      });
    }
  }
);

// ========================================
// SOFT DELETE DE TÉCNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   delete:
 *     summary: Deleta um técnico (soft delete)
 *     description: Marca o técnico como deletado sem removê-lo permanentemente. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: permanente
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Técnico deletado com sucesso
 *       400:
 *         description: Técnico tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao deletar técnico
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const permanente = req.query.permanente === 'true';

      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
          _count: {
            select: {
              tecnicoChamados: {
                where: { deletadoEm: null },
              },
            },
          },
        },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      if (permanente) {
        if (tecnico._count.tecnicoChamados > 0) {
          return res.status(400).json({
            error: `Não é possível deletar permanentemente. Existem ${tecnico._count.tecnicoChamados} chamados vinculados.`,
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.expediente.deleteMany({ where: { usuarioId: id } });
          await tx.usuario.delete({ where: { id } });
        });

        console.log('[TECNICO DELETED PERMANENTLY]', { 
          id, 
          email: tecnico.email 
        });

        return res.json({
          message: 'Técnico removido permanentemente',
          id,
        });
      }

      // SOFT DELETE
      await prisma.usuario.update({
        where: { id },
        data: {
          deletadoEm: new Date(),
          ativo: false,
        },
      });

      console.log('[TECNICO SOFT DELETED]', { 
        id, 
        email: tecnico.email 
      });

      res.json({
        message: 'Técnico deletado com sucesso',
        id,
      });
    } catch (err: any) {
      console.error('[TECNICO DELETE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao deletar técnico',
      });
    }
  }
);

// ========================================
// RESTAURAR TÉCNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/restaurar:
 *   patch:
 *     summary: Restaura um técnico deletado
 *     description: Remove a marcação de deleção de um técnico. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Técnico restaurado com sucesso
 *       400:
 *         description: Técnico não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao restaurar técnico
 */
router.patch(
  '/:id/restaurar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const tecnico = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
        },
      });

      if (!tecnico || tecnico.regra !== Regra.TECNICO) {
        return res.status(404).json({
          error: 'Técnico não encontrado',
        });
      }

      if (!tecnico.deletadoEm) {
        return res.status(400).json({
          error: 'Técnico não está deletado',
        });
      }

      const restaurado = await prisma.usuario.update({
        where: { id },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: TECNICO_SELECT,
      });

      console.log('[TECNICO RESTORED]', { id, email: tecnico.email });

      res.json({
        message: 'Técnico restaurado com sucesso',
        tecnico: restaurado,
      });
    } catch (err: any) {
      console.error('[TECNICO RESTORE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao restaurar técnico',
      });
    }
  }
);

export default router;