import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyPassword } from '../utils/password';
import { prisma } from '../lib/prisma';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { cacheSet, cacheGet } from '../services/redisClient';

export const router: Router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TIME = 15 * 60;

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
  await cacheSet(key, '0', 1);
}

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário
 *           example: usuario@exemplo.com
 *         password:
 *           type: string
 *           format: password
 *           description: Senha do usuário
 *           example: SenhaSegura123!
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         usuario:
 *           $ref: '#/components/schemas/Usuario'
 *         accessToken:
 *           type: string
 *           description: Token de acesso JWT
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         refreshToken:
 *           type: string
 *           description: Token de atualização
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expiresIn:
 *           type: number
 *           description: Tempo de expiração do token em segundos
 *           example: 3600
 *     
 *     Usuario:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: ID único do usuário
 *           example: clx1234567890abcdef
 *         nome:
 *           type: string
 *           description: Nome do usuário
 *           example: João
 *         sobrenome:
 *           type: string
 *           description: Sobrenome do usuário
 *           example: Silva
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário
 *           example: joao.silva@exemplo.com
 *         telefone:
 *           type: string
 *           description: Telefone do usuário
 *           example: (11) 98765-4321
 *         ramal:
 *           type: string
 *           description: Ramal do usuário
 *           example: "1234"
 *         setor:
 *           type: string
 *           description: Setor do usuário
 *           example: TI
 *         regra:
 *           type: string
 *           enum: [ADMIN, USUARIO, MODERADOR]
 *           description: Regra/papel do usuário no sistema
 *           example: USUARIO
 *         avatarUrl:
 *           type: string
 *           description: URL do avatar do usuário
 *           example: https://exemplo.com/avatar.jpg
 *         ativo:
 *           type: boolean
 *           description: Status de ativação da conta
 *           example: true
 *         geradoEm:
 *           type: string
 *           format: date-time
 *           description: Data de criação da conta
 *           example: 2024-01-01T10:00:00.000Z
 *     
 *     RefreshTokenRequest:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: Token de atualização válido
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     
 *     RefreshTokenResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *           description: Novo token de acesso JWT
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         refreshToken:
 *           type: string
 *           description: Novo token de atualização
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expiresIn:
 *           type: number
 *           description: Tempo de expiração em segundos
 *           example: 3600
 *     
 *     StatusResponse:
 *       type: object
 *       properties:
 *         autenticado:
 *           type: boolean
 *           description: Status de autenticação
 *           example: true
 *         usuario:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: clx1234567890abcdef
 *             email:
 *               type: string
 *               example: usuario@exemplo.com
 *             regra:
 *               type: string
 *               example: USUARIO
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Mensagem de erro
 *           example: Credenciais inválidas
 *         tentativasRestantes:
 *           type: number
 *           description: Tentativas de login restantes
 *           example: 3
 *         bloqueadoAte:
 *           type: string
 *           format: date-time
 *           description: Data até quando a conta está bloqueada
 *           example: 2024-01-01T10:15:00.000Z
 *   
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Token JWT obtido através do endpoint de login
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Realizar login no sistema
 *     description: Autentica um usuário com email e senha, retornando tokens de acesso e atualização. Implementa proteção contra força bruta com limite de 5 tentativas e bloqueio de 15 minutos.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Dados inválidos ou ausentes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               camposObrigatorios:
 *                 value:
 *                   error: Email e senha são obrigatórios
 *               emailInvalido:
 *                 value:
 *                   error: Email inválido
 *       401:
 *         description: Credenciais inválidas ou conta inativa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               credenciaisInvalidas:
 *                 value:
 *                   error: Credenciais inválidas
 *                   tentativasRestantes: 3
 *               contaInativa:
 *                 value:
 *                   error: Conta inativa. Entre em contato com o administrador.
 *       429:
 *         description: Muitas tentativas de login - conta temporariamente bloqueada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Muitas tentativas de login. Tente novamente em 15 minutos.
 *               tentativasRestantes: 0
 *               bloqueadoAte: 2024-01-01T10:15:00.000Z
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Erro interno ao realizar login.
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

    const passwordMatch = verifyPassword(password, usuario.password);
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

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Realizar logout do sistema
 *     description: Invalida o token de acesso atual, remove o refresh token do banco de dados e destroi a sessão do usuário. O token é adicionado à blacklist até sua expiração natural.
 *     tags:
 *       - Autenticação
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logout realizado com sucesso.
 *       401:
 *         description: Token inválido ou ausente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Não autorizado.
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Erro ao realizar logout.
 */
router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  try {
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
      prisma.usuario.update({
        where: { id: req.usuario.id },
        data: { refreshToken: null },
      }),
      
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

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Renovar tokens de autenticação
 *     description: Gera um novo par de tokens (access e refresh) utilizando um refresh token válido. O refresh token antigo é invalidado e um novo é gerado.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Tokens renovados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshTokenResponse'
 *       400:
 *         description: Refresh token não fornecido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Refresh token é obrigatório.
 *       401:
 *         description: Refresh token inválido, expirado ou conta inativa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               usuarioNaoEncontrado:
 *                 value:
 *                   error: Usuário não encontrado.
 *               contaInativa:
 *                 value:
 *                   error: Conta inativa.
 *               tokenInvalido:
 *                 value:
 *                   error: Refresh token inválido ou expirado.
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obter perfil do usuário autenticado
 *     description: Retorna as informações completas do perfil do usuário atualmente autenticado, excluindo dados sensíveis como senha e tokens.
 *     tags:
 *       - Autenticação
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Token inválido ou ausente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Não autorizado.
 *       404:
 *         description: Usuário não encontrado no banco de dados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Usuário não encontrado.
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Erro ao buscar perfil do usuário.
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

/**
 * @swagger
 * /auth/status:
 *   get:
 *     summary: Verificar status de autenticação
 *     description: Verifica se o usuário está autenticado e retorna informações básicas da sessão. Útil para validar tokens antes de realizar operações sensíveis.
 *     tags:
 *       - Autenticação
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status de autenticação retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatusResponse'
 *       401:
 *         description: Usuário não autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 autenticado:
 *                   type: boolean
 *                   example: false
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