import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Gerenciamento de usuários administradores
 */

// ========================================
// CRIAÇÃO DE USUARIO COM PERFIL ADMIN
// ========================================

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
 *               sobrenome:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Administrador criado com sucesso
 *       400:
 *         description: Dados inválidos ou email já cadastrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { nome, sobrenome, email, password } = req.body;
  if (!email || !password || !nome || !sobrenome) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const admin = await prisma.usuario.create({
        data: { nome, sobrenome, email, password: hashedPassword, regra: 'ADMIN' },
      });
      
      const { password: _, ...adminSemSenha } = admin;
      res.json(adminSemSenha);
      
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ========================================
// LISTAGEM DE TODOS OS USUÁRIOS COM A REGRA DE PERFIL ADMIN
// ========================================

/**
 * @swagger
 * /api/admin:
 *   get:
 *     summary: Lista todos os administradores
 *     description: Retorna uma lista com todos os usuários que possuem perfil ADMIN. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de administradores retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const admins = await prisma.usuario.findMany({ where: { regra: 'ADMIN' } });
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// EDIÇÃO DE USUÁRIOS COM A REGRA DE PERFIL ADMIN
// ========================================

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
 *           format: uuid
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
 *     responses:
 *       200:
 *         description: Administrador atualizado com sucesso
 *       400:
 *         description: Dados inválidos ou administrador não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { nome, sobrenome, email, password } = req.body;

  try {
    const data: any = { nome, sobrenome, email };
    if (password) data.password = await bcrypt.hash(password, 10);

    const admin = await prisma.usuario.update({
      where: { id },
      data,
    });
    res.json(admin);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================
// EXCLUSÃO DOS USUÁRIOS COM A REGRA DE PERFIL ADMIN
// ========================================

/**
 * @swagger
 * /api/admin/{id}:
 *   delete:
 *     summary: Exclui um administrador
 *     description: Remove permanentemente um administrador do sistema. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do administrador a ser excluído
 *     responses:
 *       200:
 *         description: Administrador excluído com sucesso
 *       400:
 *         description: Administrador não encontrado ou erro na exclusão
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.usuario.delete({ where: { id } });
    res.json({ message: 'Admin excluído com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;