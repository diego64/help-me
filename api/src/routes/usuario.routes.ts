import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { Setor } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';
import { cacheSet, cacheGet } from '../services/redisClient';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Gerenciamento de usuários do sistema
 */

// ====================================================
// CONFIGURAÇÃO DE UPLOAD DE IMAGEM DO AVATAR
// ====================================================

const upload = multer({ dest: 'uploads/' });

// ====================================================
// DADOS NECESSARIOS PARA CRIAÇÃO DO USUARIO
// ====================================================

interface usuarioInput {
  nome: string;
  sobrenome: string;
  email: string;
  password?: string;
  telefone?: string;
  ramal?: string;
  setor: Setor;
}

// ====================================================
// CRIAÇÃO DO PERFIL USUARIO
// ====================================================

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Cria um novo usuário
 *     description: Cadastra um usuário no sistema com perfil USUARIO. A senha é obrigatória e será criptografada antes de ser armazenada. Requer autenticação e perfil ADMIN.
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
 *                 description: Nome do usuário
 *               sobrenome:
 *                 type: string
 *                 description: Sobrenome do usuário
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email do usuário
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Senha do usuário
 *               telefone:
 *                 type: string
 *                 description: Telefone do usuário (opcional)
 *               ramal:
 *                 type: string
 *                 description: Ramal do usuário (opcional)
 *               setor:
 *                 type: string
 *                 enum: [TECNOLOGIA_INFORMACAO, RECURSOS_HUMANOS, FINANCEIRO, OPERACIONAL, COMERCIAL, ADMINISTRATIVO]
 *                 description: Setor do usuário
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       400:
 *         description: Dados inválidos ou senha não fornecida
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
    try {
      const { nome, sobrenome, email, password, telefone, ramal, setor } = req.body as usuarioInput;

      if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const usuario = await prisma.usuario.create({
        data: {
          nome,
          sobrenome,
          email,
          password: hashedPassword,
          telefone,
          ramal,
          setor,
          regra: 'USUARIO',
        },
      });

      return res.status(201).json(usuario);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// ====================================================
// LISTAGEM DE TODOS OS USUARIOS
// ====================================================

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Lista todos os usuários
 *     description: Retorna todos os usuários com perfil USUARIO cadastrados no sistema. Utiliza cache Redis com TTL de 60 segundos para otimizar performance. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   nome:
 *                     type: string
 *                   sobrenome:
 *                     type: string
 *                   email:
 *                     type: string
 *                   telefone:
 *                     type: string
 *                     nullable: true
 *                   ramal:
 *                     type: string
 *                     nullable: true
 *                   setor:
 *                     type: string
 *                   avatarUrl:
 *                     type: string
 *                     nullable: true
 *                   geradoEm:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       500:
 *         description: Erro ao listar usuários
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
    try {
      const cacheKey = 'usuarios:list:admin';
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached)); // Retorno acelerado do cache
      }

      // Consulta ao banco apenas se o cache não existe
      const usuarios = await prisma.usuario.findMany({
        where: { regra: 'USUARIO' },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          telefone: true,
          ramal: true,
          setor: true,
          avatarUrl: true,
          geradoEm: true,
        },
      });

      // Salva resultado no cache por 60 segundos (pode ajustar o TTL)
      await cacheSet(cacheKey, JSON.stringify(usuarios), 60);

      res.json(usuarios);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
  }
);

// ====================================================
// BUSCA PELO USUARIO ATRAVÉS DO EMAIL
// ====================================================

/**
 * @swagger
 * /api/usuarios/email:
 *   post:
 *     summary: Busca um usuário por email
 *     description: Localiza um usuário específico através do endereço de email. Retorna informações completas do usuário (exceto senha). Requer autenticação e perfil ADMIN.
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
 *                 description: Email do usuário a ser buscado
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 nome:
 *                   type: string
 *                 sobrenome:
 *                   type: string
 *                 email:
 *                   type: string
 *                 telefone:
 *                   type: string
 *                   nullable: true
 *                 ramal:
 *                   type: string
 *                   nullable: true
 *                 setor:
 *                   type: string
 *                 regra:
 *                   type: string
 *                 avatarUrl:
 *                   type: string
 *                   nullable: true
 *                 geradoEm:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Email não fornecido ou inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar usuário
 */
router.post('/email', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'E-mail é obrigatório e deve ser uma string.' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          telefone: true,
          ramal: true,
          setor: true,
          regra: true,
          avatarUrl: true,
          geradoEm: true,
        },
      });

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json(usuario);
    } catch (err: any) {
      console.error('Erro ao buscar usuário por e-mail:', err);
      res.status(500).json({ error: 'Erro ao buscar usuário.' });
    }
  }
);

// ====================================================
// EDIÇÃO DO PERFIL DO USUARIO
// ====================================================

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza os dados de um usuário
 *     description: Permite editar informações cadastrais do usuário (nome, sobrenome, email, telefone, ramal e setor). Requer autenticação e perfil ADMIN ou USUARIO (próprio).
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do usuário a ser atualizado
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
 *                 format: email
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               setor:
 *                 type: string
 *                 enum: [TECNOLOGIA_INFORMACAO, RECURSOS_HUMANOS, FINANCEIRO, OPERACIONAL, COMERCIAL, ADMINISTRATIVO]
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO próprio)
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { nome, sobrenome, email, telefone, ramal, setor } = req.body as Partial<usuarioInput>;

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { nome, sobrenome, email, telefone, ramal, setor },
    });

    res.json(usuario);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ====================================================
// ALTERAÇÃO DE SENHA
// ====================================================

/**
 * @swagger
 * /api/usuarios/{id}/senha:
 *   put:
 *     summary: Altera a senha de um usuário
 *     description: Permite redefinir a senha de um usuário. A senha é criptografada antes de ser armazenada. Requer autenticação e perfil ADMIN ou USUARIO (próprio).
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do usuário
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
 *                 description: Nova senha
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Senha não fornecida ou erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO próprio)
 */
router.put('/:id/senha', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body as { password: string };

    if (!password) return res.status(400).json({ error: 'A nova senha é obrigatória.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.usuario.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ====================================================
// EXCLUSÃO DA CONTA DO USUARIO 
// ====================================================

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Exclui um usuário
 *     description: Remove permanentemente o usuário e todos os chamados associados do sistema. Esta ação é irreversível. Requer autenticação e perfil ADMIN ou USUARIO (próprio).
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do usuário a ser excluído
 *     responses:
 *       200:
 *         description: Usuário e chamados associados excluídos com sucesso
 *       400:
 *         description: Erro ao excluir usuário
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO próprio)
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.chamado.deleteMany({ where: { usuarioId: id } });
    await prisma.usuario.delete({ where: { id } });

    res.json({ message: 'Usuário e chamados associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ====================================================
// ENVIO DA FOTO DE PERFIL DO USUARIO 
// ====================================================

/**
 * @swagger
 * /api/usuarios/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil do usuário
 *     description: Permite enviar uma imagem de avatar/foto de perfil para o usuário. O arquivo é salvo no servidor e o caminho é armazenado no banco de dados. Requer autenticação e perfil ADMIN ou USUARIO (próprio).
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do usuário
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
 *                 description: Arquivo de imagem do avatar
 *     responses:
 *       200:
 *         description: Imagem de perfil atualizada com sucesso
 *       400:
 *         description: Arquivo não enviado ou erro no upload
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO próprio)
 */
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { avatarUrl: file.path },
    });

    res.json({ message: 'Imagem de perfil atualizada com sucesso.', usuario });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;