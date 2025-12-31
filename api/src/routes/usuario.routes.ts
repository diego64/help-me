import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Setor, Regra } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';
import { cacheSet, cacheGet, cacheDel } from '../services/redisClient';

export const router: Router = Router();

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NOME_LENGTH = 2;
const MAX_NOME_LENGTH = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CACHE_TTL = 60; // 60 segundos
const CACHE_KEY_PREFIX = 'usuarios:';

// Upload config
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

async function invalidarCacheListagem() {
  try {
    await cacheDel(`${CACHE_KEY_PREFIX}list`);
  } catch (err) {
    console.error('[CACHE INVALIDATION ERROR]', err);
  }
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

const USUARIO_SELECT = {
  id: true,
  nome: true,
  sobrenome: true,
  email: true,
  telefone: true,
  ramal: true,
  setor: true,
  avatarUrl: true,
  ativo: true,
  regra: true,
  geradoEm: true,
  atualizadoEm: true,
  deletadoEm: true,
  _count: {
    select: {
      chamadoOS: {
        where: { deletadoEm: null },
      },
    },
  },
} as const;

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Gerenciamento de usuários do sistema
 */

// ========================================
// CRIAÇÃO DE USUÁRIO
// ========================================

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Cria um novo usuário
 *     description: Cadastra um usuário no sistema com perfil USUARIO. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
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
 *               - setor
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
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               setor:
 *                 type: string
 *                 enum: [ADMINISTRACAO, ALMOXARIFADO, CALL_CENTER, COMERCIAL, DEPARTAMENTO_PESSOAL, FINANCEIRO, JURIDICO, LOGISTICA, MARKETING, QUALIDADE, RECURSOS_HUMANOS, TECNOLOGIA_INFORMACAO]
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       409:
 *         description: Email já cadastrado
 *       500:
 *         description: Erro ao criar usuário
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { nome, sobrenome, email, password, telefone, ramal, setor } = req.body;

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

      if (!setor || !Object.values(Setor).includes(setor)) {
        return res.status(400).json({
          error: 'Setor inválido',
          setoresValidos: Object.values(Setor),
        });
      }

      // Verificar email único
      const emailExistente = await prisma.usuario.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, deletadoEm: true },
      });

      if (emailExistente) {
        if (emailExistente.deletadoEm) {
          return res.status(409).json({
            error: 'Já existe um usuário deletado com este email',
          });
        }
        return res.status(409).json({
          error: 'Email já cadastrado',
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const usuario = await prisma.usuario.create({
        data: {
          nome: nome.trim(),
          sobrenome: sobrenome.trim(),
          email: email.toLowerCase(),
          password: hashedPassword,
          telefone: telefone?.trim() || null,
          ramal: ramal?.trim() || null,
          setor,
          regra: Regra.USUARIO,
        },
        select: USUARIO_SELECT,
      });

      // Invalidar cache
      await invalidarCacheListagem();

      console.log('[USUARIO CREATED]', { id: usuario.id, email: usuario.email });

      res.status(201).json(usuario);
    } catch (err: any) {
      console.error('[USUARIO CREATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao criar usuário',
      });
    }
  }
);

// ========================================
// LISTAGEM DE USUÁRIOS (COM CACHE E PAGINAÇÃO)
// ========================================

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Lista todos os usuários
 *     description: Retorna todos os usuários com perfil USUARIO. Utiliza cache Redis e paginação. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
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
 *         description: Lista de usuários retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar usuários
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { incluirInativos, incluirDeletados, setor, busca } = req.query;

      // Construir chave de cache
      const cacheKey = `${CACHE_KEY_PREFIX}list:${page}:${limit}:${incluirInativos}:${incluirDeletados}:${setor}:${busca}`;

      // Tentar buscar do cache
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      // Construir filtros
      const where: any = {
        regra: Regra.USUARIO,
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
      const [total, usuarios] = await Promise.all([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({
          where,
          select: USUARIO_SELECT,
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(usuarios, total, page, limit);

      // Salvar no cache
      await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL);

      res.json(response);
    } catch (err: any) {
      console.error('[USUARIO LIST ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar usuários',
      });
    }
  }
);

// ========================================
// BUSCAR USUÁRIO POR ID
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Busca um usuário por ID
 *     description: Retorna os detalhes de um usuário específico. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
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
 *         description: Usuário encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar usuário
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Usuário só pode ver seu próprio perfil
      if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode visualizar seu próprio perfil',
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: USUARIO_SELECT,
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      res.json(usuario);
    } catch (err: any) {
      console.error('[USUARIO GET ERROR]', err);
      res.status(500).json({
        error: 'Erro ao buscar usuário',
      });
    }
  }
);

// ========================================
// BUSCAR POR EMAIL
// ========================================

/**
 * @swagger
 * /api/usuarios/email:
 *   post:
 *     summary: Busca um usuário por email
 *     description: Localiza um usuário através do email. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *       400:
 *         description: Email não fornecido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar usuário
 */
router.post(
  '/email',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email } = req.body;

      const validacao = validarEmail(email);
      if (!validacao.valido) {
        return res.status(400).json({ error: validacao.erro });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { email: email.toLowerCase() },
        select: USUARIO_SELECT,
      });

      if (!usuario) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      res.json(usuario);
    } catch (err: any) {
      console.error('[USUARIO EMAIL ERROR]', err);
      res.status(500).json({
        error: 'Erro ao buscar usuário',
      });
    }
  }
);

// ========================================
// ATUALIZAR USUÁRIO
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza os dados de um usuário
 *     description: Permite editar informações cadastrais. Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
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
 *         description: Usuário atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       409:
 *         description: Email já em uso
 *       500:
 *         description: Erro ao atualizar usuário
 */
router.put(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { nome, sobrenome, email, telefone, ramal, setor } = req.body;

      // Verificar permissão
      if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode editar seu próprio perfil',
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
        },
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      if (usuario.deletadoEm) {
        return res.status(400).json({
          error: 'Não é possível editar um usuário deletado',
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

      if (sobrenome !== undefined) {
        const validacao = validarNome(sobrenome, 'Sobrenome');
        if (!validacao.valido) {
          return res.status(400).json({ error: validacao.erro });
        }
        dataToUpdate.sobrenome = sobrenome.trim();
      }

      if (email !== undefined) {
        const validacao = validarEmail(email);
        if (!validacao.valido) {
          return res.status(400).json({ error: validacao.erro });
        }

        const emailLower = email.toLowerCase();

        if (emailLower !== usuario.email) {
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

      if (telefone !== undefined) {
        dataToUpdate.telefone = telefone?.trim() || null;
      }

      if (ramal !== undefined) {
        dataToUpdate.ramal = ramal?.trim() || null;
      }

      if (setor !== undefined && req.usuario!.regra === Regra.ADMIN) {
        dataToUpdate.setor = setor as Setor;
      }

      if (Object.keys(dataToUpdate).length === 0) {
        const current = await prisma.usuario.findUnique({
          where: { id },
          select: USUARIO_SELECT,
        });
        return res.json(current);
      }

      const updated = await prisma.usuario.update({
        where: { id },
        data: dataToUpdate,
        select: USUARIO_SELECT,
      });

      // Invalidar cache
      await invalidarCacheListagem();

      console.log('[USUARIO UPDATED]', { id, email: updated.email });

      res.json(updated);
    } catch (err: any) {
      console.error('[USUARIO UPDATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao atualizar usuário',
      });
    }
  }
);

// ========================================
// ALTERAR SENHA
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}/senha:
 *   put:
 *     summary: Altera a senha de um usuário
 *     description: Permite redefinir a senha. Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
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
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao alterar senha
 */
router.put(
  '/:id/senha',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      // Verificar permissão
      if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode alterar sua própria senha',
        });
      }

      // Validar senha
      const validacao = validarSenha(password);
      if (!validacao.valida) {
        return res.status(400).json({ error: validacao.erro });
      }

      // Verificar usuário
      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, regra: true },
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await prisma.usuario.update({
        where: { id },
        data: { password: hashedPassword },
      });

      console.log('[USUARIO PASSWORD UPDATED]', { id });

      res.json({
        message: 'Senha alterada com sucesso',
      });
    } catch (err: any) {
      console.error('[USUARIO PASSWORD ERROR]', err);
      res.status(500).json({
        error: 'Erro ao alterar senha',
      });
    }
  }
);

// ========================================
// UPLOAD DE AVATAR
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil
 *     description: Permite enviar avatar (JPEG, PNG, WEBP, max 5MB). Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
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
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post(
  '/:id/avatar',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO'),
  upload.single('avatar'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const file = req.file;

      if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode fazer upload do seu próprio avatar',
        });
      }

      if (!file) {
        return res.status(400).json({
          error: 'Arquivo não enviado',
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, regra: true },
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
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

      // Invalidar cache
      await invalidarCacheListagem();

      console.log('[USUARIO AVATAR UPLOADED]', {
        id,
        file: file.filename,
      });

      res.json({
        message: 'Avatar enviado com sucesso',
        avatarUrl: updated.avatarUrl,
      });
    } catch (err: any) {
      console.error('[USUARIO AVATAR ERROR]', err);
      res.status(500).json({
        error: 'Erro ao fazer upload do avatar',
      });
    }
  }
);

// ========================================
// SOFT DELETE
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Deleta um usuário (soft delete)
 *     description: Marca o usuário como deletado. Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
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
 *         description: Usuário deletado com sucesso
 *       400:
 *         description: Usuário tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao deletar usuário
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const permanente = req.query.permanente === 'true';

      if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
        return res.status(403).json({
          error: 'Você só pode deletar sua própria conta',
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
          _count: {
            select: {
              chamadoOS: {
                where: { deletadoEm: null },
              },
            },
          },
        },
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      if (permanente) {
        if (usuario._count.chamadoOS > 0) {
          return res.status(400).json({
            error: `Não é possível deletar permanentemente. Existem ${usuario._count.chamadoOS} chamados vinculados.`,
          });
        }

        await prisma.usuario.delete({
          where: { id },
        });

        console.log('[USUARIO DELETED PERMANENTLY]', { id, email: usuario.email });

        await invalidarCacheListagem();

        return res.json({
          message: 'Usuário removido permanentemente',
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

      await invalidarCacheListagem();

      console.log('[USUARIO SOFT DELETED]', { id, email: usuario.email });

      res.json({
        message: 'Usuário deletado com sucesso',
        id,
      });
    } catch (err: any) {
      console.error('[USUARIO DELETE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao deletar usuário',
      });
    }
  }
);

// ========================================
// RESTAURAR USUÁRIO
// ========================================

/**
 * @swagger
 * /api/usuarios/{id}/restaurar:
 *   patch:
 *     summary: Restaura um usuário deletado
 *     description: Remove a marcação de deleção. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
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
 *         description: Usuário restaurado com sucesso
 *       400:
 *         description: Usuário não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao restaurar usuário
 */
router.patch(
  '/:id/restaurar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          regra: true,
          email: true,
          deletadoEm: true,
        },
      });

      if (!usuario || usuario.regra !== Regra.USUARIO) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
        });
      }

      if (!usuario.deletadoEm) {
        return res.status(400).json({
          error: 'Usuário não está deletado',
        });
      }

      const restaurado = await prisma.usuario.update({
        where: { id },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: USUARIO_SELECT,
      });

      await invalidarCacheListagem();

      console.log('[USUARIO RESTORED]', { id, email: usuario.email });

      res.json({
        message: 'Usuário restaurado com sucesso',
        usuario: restaurado,
      });
    } catch (err: any) {
      console.error('[USUARIO RESTORE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao restaurar usuário',
      });
    }
  }
);

export default router;