import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { cacheSet, cacheGet } from '../services/redisClient';

export const router: Router = Router();

const BCRYPT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TIME = 15 * 60; // 15 minutos em segundos

const USUARIO_SELECT_COMPLETO = {
  id: true,
  nome: true,
  sobrenome: true,
  email: true,
  password: true,
  regra: true,
  setor: true,
  telefone: true,
  ramal: true,
  avatarUrl: true,
  refreshToken: true,
  ativo: true,
  deletadoEm: true,
  geradoEm: true,
  atualizadoEm: true,
} as const;

function validarEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function removerCamposSensiveis(usuario: any) {
  const { password, refreshToken, ...usuarioLimpo } = usuario;
  return usuarioLimpo;
}

async function verificarTentativasLogin(email: string): Promise<{ bloqueado: boolean; tentativas: number }> {
  const key = `login:attempts:${email}`;
  const tentativasStr = await cacheGet(key);
  const tentativas = tentativasStr ? parseInt(tentativasStr) : 0;

  if (tentativas >= MAX_LOGIN_ATTEMPTS) {
    return { bloqueado: true, tentativas };
  }

  return { bloqueado: false, tentativas };
}

async function incrementarTentativasLogin(email: string): Promise<void> {
  const key = `login:attempts:${email}`;
  const tentativasStr = await cacheGet(key);
  const tentativas = tentativasStr ? parseInt(tentativasStr) + 1 : 1;
  
  await cacheSet(key, tentativas.toString(), LOGIN_LOCKOUT_TIME);
}


async function limparTentativasLogin(email: string): Promise<void> {
  const key = `login:attempts:${email}`;
  await cacheSet(key, '0', 1); // Expira em 1 segundo
}

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
 *     description: Realiza o login do usuário, gerando tokens de acesso (accessToken) e atualização (refreshToken). Implementa proteção contra força bruta (5 tentativas em 15 minutos).
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
 *                 example: admin@helpme.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin123!
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     nome:
 *                       type: string
 *                     sobrenome:
 *                       type: string
 *                     email:
 *                       type: string
 *                     regra:
 *                       type: string
 *                     setor:
 *                       type: string
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 expiresIn:
 *                   type: number
 *       400:
 *         description: Email e senha são obrigatórios
 *       401:
 *         description: Credenciais inválidas ou conta inativa
 *       429:
 *         description: Muitas tentativas de login - conta temporariamente bloqueada
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }

    if (!validarEmail(email)) {
      return res.status(400).json({ 
        error: 'Email inválido' 
      });
    }

    const { bloqueado, tentativas } = await verificarTentativasLogin(email);
    if (bloqueado) {
      return res.status(429).json({
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
        tentativasRestantes: 0,
        bloqueadoAte: new Date(Date.now() + LOGIN_LOCKOUT_TIME * 1000),
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: USUARIO_SELECT_COMPLETO,
    });

    if (!usuario) {
      await incrementarTentativasLogin(email);
      return res.status(401).json({ 
        error: 'Credenciais inválidas',
        tentativasRestantes: MAX_LOGIN_ATTEMPTS - (tentativas + 1),
      });
    }

    if (!usuario.ativo || usuario.deletadoEm) {
      return res.status(401).json({ 
        error: 'Conta inativa. Entre em contato com o administrador.' 
      });
    }

    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      await incrementarTentativasLogin(email);
      return res.status(401).json({ 
        error: 'Credenciais inválidas',
        tentativasRestantes: MAX_LOGIN_ATTEMPTS - (tentativas + 1),
      });
    }

    await limparTentativasLogin(email);

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
      regra: usuario.regra,
    };

    return res.json({
      usuario: removerCamposSensiveis(usuario),
      accessToken,
      refreshToken,
      expiresIn,
    });
  } catch (err: any) {
    console.error('[AUTH LOGIN ERROR]', err);
    return res.status(500).json({ 
      error: 'Erro interno ao realizar login.' 
    });
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
    // Extrair e adicionar JWT à blacklist
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && decoded.jti && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await cacheSet(`jwt:blacklist:${decoded.jti}`, 'revogado', ttl);
        }
      }
    }

    await Promise.all([
      // Remover refreshToken do usuário
      prisma.usuario.update({
        where: { id: req.usuario.id },
        data: { refreshToken: null },
      }),
      
      // Destruir sessão
      new Promise<void>((resolve, reject) => {
        req.session.destroy((err: any) => {
          if (err) {
            console.error('[SESSION DESTROY ERROR]', err);
            return reject(err);
          }
          resolve();
        });
      }),
    ]);

    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (err: any) {
    console.error('[AUTH LOGOUT ERROR]', err);
    return res.status(500).json({ 
      error: 'Erro ao realizar logout.' 
    });
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
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Tokens renovados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 expiresIn:
 *                   type: number
 *       400:
 *         description: Refresh token não fornecido
 *       401:
 *         description: Refresh token inválido, expirado ou usuário inativo
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    
    if (!refreshToken) {
      return res.status(400).json({ 
        error: 'Refresh token é obrigatório.' 
      });
    }

    const payload = verifyToken(refreshToken, 'refresh');

    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: USUARIO_SELECT_COMPLETO,
    });

    if (!usuario) {
      return res.status(401).json({ 
        error: 'Usuário não encontrado.' 
      });
    }

    if (!usuario.ativo || usuario.deletadoEm) {
      return res.status(401).json({ 
        error: 'Conta inativa.' 
      });
    }

    if (usuario.refreshToken !== refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token inválido ou expirado.' 
      });
    }

    const { 
      accessToken, 
      refreshToken: newRefreshToken, 
      expiresIn 
    } = generateTokenPair(usuario);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({ 
      accessToken, 
      refreshToken: newRefreshToken, 
      expiresIn 
    });
  } catch (err: any) {
    console.error('[AUTH REFRESH ERROR]', err);
    return res.status(401).json({ 
      error: err.message || 'Refresh token inválido.' 
    });
  }
});

// ================================
// ME (PERFIL DO USUÁRIO)
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
 *                 telefone:
 *                   type: string
 *                 ramal:
 *                   type: string
 *                 setor:
 *                   type: string
 *                 regra:
 *                   type: string
 *                 avatarUrl:
 *                   type: string
 *                 geradoEm:
 *                   type: string
 *                   format: date-time
 *                 ativo:
 *                   type: boolean
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
        ativo: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado.' 
      });
    }

    res.json(usuario);
  } catch (err: any) {
    console.error('[AUTH ME ERROR]', err);
    res.status(500).json({ 
      error: 'Erro ao buscar perfil do usuário.' 
    });
  }
});

// ================================
// VERIFICAR STATUS DA CONTA
// ================================

/**
 * @swagger
 * /api/auth/status:
 *   get:
 *     summary: Verifica o status da autenticação
 *     description: Retorna informações sobre o status da sessão e token do usuário. Útil para verificar se o usuário ainda está autenticado.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 autenticado:
 *                   type: boolean
 *                 usuario:
 *                   type: object
 *       401:
 *         description: Não autenticado
 */
router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.usuario) {
    return res.status(401).json({ 
      autenticado: false 
    });
  }

  res.json({
    autenticado: true,
    usuario: {
      id: req.usuario.id,
      email: req.usuario.email,
      regra: req.usuario.regra,
    },
  });
});

export default router;