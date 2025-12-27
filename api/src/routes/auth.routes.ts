import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { cacheSet } from '../services/redisClient'; 

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Endpoints de autenticação e gerenciamento de sessão
 */

// ================================
// LOGIN
// ================================

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário no sistema
 *     description: Realiza o login do usuário, gerando tokens de acesso (accessToken) e atualização (refreshToken). Também cria uma sessão no servidor.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       400:
 *         description: Email e senha são obrigatórios
 *       401:
 *         description: Credenciais inválidas (usuário não encontrado ou senha incorreta)
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const { accessToken, refreshToken, expiresIn } = generateTokenPair(usuario);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { refreshToken },
    });

    (req.session as any).usuario = {
      id: usuario.id,
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      email: usuario.email,
      regra: usuario.regra
    };

    return res.json({
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        sobrenome: usuario.sobrenome,
        email: usuario.email,
        regra: usuario.regra,
      },
      accessToken,
      refreshToken,
      expiresIn,
    });
  } catch (err: any) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

// ================================
// LOGOUT
// ================================

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerra a sessão do usuário
 *     description: Realiza o logout do usuário, revogando o token JWT (adicionando à blacklist), removendo o refreshToken do banco de dados e destruindo a sessão no Redis. Requer autenticação.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao realizar logout ou encerrar sessão
 */
router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  try {
    // Blacklist do JWT
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && decoded.jti && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        await cacheSet(`jwt:blacklist:${decoded.jti}`, 'revogado', ttl);
      }
    }

    // Remove refreshToken do usuário
    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { refreshToken: null },
    });

    // Invalida a sessão do usuário no Redis — TRANSFORME EM PROMISE!
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err: any) => {
        if (err) {
          res.status(500).json({ error: 'Erro ao encerrar a sessão.' });
          return reject(err);
        }
        res.json({ message: 'Logout realizado com sucesso.' });
        resolve();
      });
    });
  } catch (err: any) {
    console.error('Erro no logout:', err);
    return res.status(500).json({ error: 'Erro ao realizar logout.' });
  }
});

// ================================
// REFRESH TOKEN
// ================================

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Renova o token de acesso
 *     description: Gera um novo par de tokens (accessToken e refreshToken) usando um refreshToken válido. O refreshToken antigo é invalidado e substituído pelo novo.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens renovados com sucesso
 *       400:
 *         description: Refresh token não fornecido
 *       401:
 *         description: Refresh token inválido ou expirado
 */
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken)
    return res.status(400).json({ error: 'Refresh token é obrigatório.' });

  try {
    const payload = verifyToken(refreshToken, 'refresh');
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });

    if (!usuario || usuario.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
    }

    const { accessToken, refreshToken: newRefreshToken, expiresIn } = generateTokenPair(usuario);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({ accessToken, refreshToken: newRefreshToken, expiresIn });
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Refresh token inválido.' });
  }
});

// ================================
// ME
// ================================

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retorna o perfil do usuário autenticado
 *     description: Busca as informações completas do usuário logado, incluindo dados pessoais e profissionais. Requer autenticação.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário retornado com sucesso
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar perfil do usuário
 */
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
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
    res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
  }
});

export default router;