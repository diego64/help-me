import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validarEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function validarSenha(password: string): { valida: boolean; erro?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { 
      valida: false, 
      erro: `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` 
    };
  }
  return { valida: true };
}

function removerCamposSensiveis(usuario: any) {
  const { password, refreshToken, ...usuarioLimpo } = usuario;
  return usuarioLimpo;
}

/**
 * @swagger
 * tags:
 *   name: Administradores
 *   description: Gerenciamento de usuários administradores
 */

/**
 * @swagger
 * /api/admin:
 *   post:
 *     summary: Cria um novo usuário administrador
 *     description: Endpoint para criação de novos administradores. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
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
 *                 example: João
 *               sobrenome:
 *                 type: string
 *                 example: Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao.silva@helpme.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Admin123!
 *               setor:
 *                 type: string
 *                 enum: [ADMINISTRACAO, ALMOXARIFADO, CALL_CENTER, COMERCIAL, DEPARTAMENTO_PESSOAL, FINANCEIRO, JURIDICO, LOGISTICA, MARKETING, QUALIDADE, RECURSOS_HUMANOS, TECNOLOGIA_INFORMACAO]
 *               telefone:
 *                 type: string
 *                 example: "(11) 99999-0001"
 *               ramal:
 *                 type: string
 *                 example: "1000"
 *               avatarUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Administrador criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 sobrenome:
 *                   type: string
 *                 email:
 *                   type: string
 *                 regra:
 *                   type: string
 *                   example: ADMIN
 *                 ativo:
 *                   type: boolean
 *                 geradoEm:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Dados inválidos ou email já cadastrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { nome, sobrenome, email, password, setor, telefone, ramal, avatarUrl } = req.body;

      if (!nome || !sobrenome || !email || !password) {
        return res.status(400).json({
          error: 'Campos obrigatórios: nome, sobrenome, email, password'
        });
      }

      if (!validarEmail(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }

      const validacaoSenha = validarSenha(password);
      if (!validacaoSenha.valida) {
        return res.status(400).json({ error: validacaoSenha.erro });
      }

      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email }
      });

      if (usuarioExistente) {
        if (usuarioExistente.deletadoEm) {
          const hashedPassword = hashPassword(password);

          const adminReativado = await prisma.usuario.update({
            where: { email },
            data: {
              nome,
              sobrenome,
              password: hashedPassword,
              regra: 'ADMIN',
              setor: setor || null,
              telefone: telefone || null,
              ramal: ramal || null,
              avatarUrl: avatarUrl || null,
              ativo: true,
              deletadoEm: null,
            },
          });

          return res.status(201).json({
            message: 'Administrador reativado com sucesso',
            admin: removerCamposSensiveis(adminReativado)
          });
        }

        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      const hashedPassword = hashPassword(password);

      const admin = await prisma.usuario.create({
        data: {
          nome,
          sobrenome,
          email,
          password: hashedPassword,
          regra: 'ADMIN',
          setor: setor || null,
          telefone: telefone || null,
          ramal: ramal || null,
          avatarUrl: avatarUrl || null,
          ativo: true,
        },
      });

      res.status(201).json(removerCamposSensiveis(admin));
    } catch (err: any) {
      console.error('[ADMIN CREATE ERROR]', err);
      res.status(500).json({ error: 'Erro ao criar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/admin:
 *   get:
 *     summary: Lista todos os administradores ativos
 *     description: Retorna uma lista com todos os usuários que possuem perfil ADMIN e estão ativos (não foram soft deleted). Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *         description: Incluir administradores inativos (soft deleted)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número da página para paginação
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Quantidade de itens por página
 *     responses:
 *       200:
 *         description: Lista de administradores retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 admins:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       500:
 *         description: Erro interno do servidor
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const incluirInativos = req.query.incluirInativos === 'true';
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const skip = (page - 1) * limit;

      const [total, admins] = await Promise.all([
        prisma.usuario.count({
          where: {
            regra: 'ADMIN',
            ...(incluirInativos ? {} : { deletadoEm: null, ativo: true }),
          },
        }),
        prisma.usuario.findMany({
          where: {
            regra: 'ADMIN',
            ...(incluirInativos ? {} : { deletadoEm: null, ativo: true }),
          },
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            setor: true,
            telefone: true,
            ramal: true,
            avatarUrl: true,
            ativo: true,
            geradoEm: true,
            atualizadoEm: true,
            deletadoEm: true,
          },
          orderBy: {
            geradoEm: 'desc',
          },
          skip,
          take: limit,
        }),
      ]);

      res.json({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        admins,
      });
    } catch (err: any) {
      console.error('[ADMIN LIST ERROR]', err);
      res.status(500).json({ error: 'Erro ao listar administradores' });
    }
  }
);

/**
 * @swagger
 * /api/admin/{id}:
 *   get:
 *     summary: Busca um administrador por ID
 *     description: Retorna os dados de um administrador específico. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do administrador
 *     responses:
 *       200:
 *         description: Administrador encontrado
 *       404:
 *         description: Administrador não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const admin = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
          setor: true,
          telefone: true,
          ramal: true,
          avatarUrl: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
          deletadoEm: true,
        },
      });

      if (!admin || admin.regra !== 'ADMIN') {
        return res.status(404).json({ error: 'Administrador não encontrado' });
      }

      res.json(admin);
    } catch (err: any) {
      console.error('[ADMIN GET ERROR]', err);
      res.status(500).json({ error: 'Erro ao buscar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/admin/{id}:
 *   put:
 *     summary: Atualiza os dados de um administrador
 *     description: Endpoint para atualização de dados de um administrador existente. A senha é opcional. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do administrador a ser atualizado
 *     requestBody:
 *       required: true
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
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               setor:
 *                 type: string
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *               ativo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Administrador atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Administrador não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.put(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { nome, sobrenome, email, password, setor, telefone, ramal, avatarUrl, ativo } = req.body;

      const adminExistente = await prisma.usuario.findUnique({
        where: { id },
      });

      if (!adminExistente || adminExistente.regra !== 'ADMIN') {
        return res.status(404).json({ error: 'Administrador não encontrado' });
      }

      if (email && email !== adminExistente.email) {
        if (!validarEmail(email)) {
          return res.status(400).json({ error: 'Email inválido' });
        }

        const emailEmUso = await prisma.usuario.findUnique({
          where: { email },
        });

        if (emailEmUso && emailEmUso.id !== id) {
          return res.status(400).json({ error: 'Email já cadastrado' });
        }
      }

      const data: any = {};

      if (nome !== undefined) data.nome = nome;
      if (sobrenome !== undefined) data.sobrenome = sobrenome;
      if (email !== undefined) data.email = email;
      if (setor !== undefined) data.setor = setor;
      if (telefone !== undefined) data.telefone = telefone;
      if (ramal !== undefined) data.ramal = ramal;
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
      if (ativo !== undefined) data.ativo = ativo;

      if (password) {
        const validacaoSenha = validarSenha(password);
        if (!validacaoSenha.valida) {
          return res.status(400).json({ error: validacaoSenha.erro });
        }
        data.password = hashPassword(password);
      }

      const admin = await prisma.usuario.update({
        where: { id },
        data,
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
          setor: true,
          telefone: true,
          ramal: true,
          avatarUrl: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
        },
      });

      res.json(admin);
    } catch (err: any) {
      console.error('[ADMIN UPDATE ERROR]', err);
      res.status(500).json({ error: 'Erro ao atualizar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/admin/{id}:
 *   delete:
 *     summary: Desativa um administrador (soft delete)
 *     description: Marca um administrador como deletado sem removê-lo permanentemente do banco. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do administrador a ser desativado
 *       - in: query
 *         name: permanente
 *         schema:
 *           type: boolean
 *         description: Se true, deleta permanentemente (USE COM CUIDADO!)
 *     responses:
 *       200:
 *         description: Administrador desativado com sucesso
 *       400:
 *         description: Não é possível deletar a si mesmo
 *       404:
 *         description: Administrador não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const permanente = req.query.permanente === 'true';

      const admin = await prisma.usuario.findUnique({
        where: { id },
      });

      if (!admin || admin.regra !== 'ADMIN') {
        return res.status(404).json({ error: 'Administrador não encontrado' });
      }

      if (req.usuario?.id === id) {
        return res.status(400).json({
          error: 'Não é possível deletar sua própria conta'
        });
      }

      if (permanente) {
        await prisma.usuario.delete({
          where: { id },
        });

        return res.json({
          message: 'Administrador excluído permanentemente',
          id,
        });
      }

      await prisma.usuario.update({
        where: { id },
        data: {
          deletadoEm: new Date(),
          ativo: false,
        },
      });

      res.json({
        message: 'Administrador desativado com sucesso',
        id,
      });
    } catch (err: any) {
      console.error('[ADMIN DELETE ERROR]', err);
      res.status(500).json({ error: 'Erro ao deletar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/admin/{id}/reativar:
 *   patch:
 *     summary: Reativa um administrador desativado
 *     description: Remove o soft delete e reativa um administrador. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do administrador a ser reativado
 *     responses:
 *       200:
 *         description: Administrador reativado com sucesso
 *       404:
 *         description: Administrador não encontrado
 *       400:
 *         description: Administrador já está ativo
 */
router.patch(
  '/:id/reativar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const admin = await prisma.usuario.findUnique({
        where: { id },
      });

      if (!admin || admin.regra !== 'ADMIN') {
        return res.status(404).json({ error: 'Administrador não encontrado' });
      }

      if (!admin.deletadoEm && admin.ativo) {
        return res.status(400).json({ error: 'Administrador já está ativo' });
      }

      const adminReativado = await prisma.usuario.update({
        where: { id },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          regra: true,
          ativo: true,
        },
      });

      res.json({
        message: 'Administrador reativado com sucesso',
        admin: adminReativado,
      });
    } catch (err: any) {
      console.error('[ADMIN REACTIVATE ERROR]', err);
      res.status(500).json({ error: 'Erro ao reativar administrador' });
    }
  }
);

export default router;