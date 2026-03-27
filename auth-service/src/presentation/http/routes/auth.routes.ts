import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '@infrastructure/http/middlewares/auth.middlewares';
import { authLimiter } from '@infrastructure/http/middlewares/rate-limit.middleware';
import { loginUseCase } from '@application/auth/login.use-case';
import { refreshTokenUseCase } from '@application/auth/refresh-token.use-case';
import { logoutUseCase } from '@application/auth/logout.use-case';
import { extractTokenFromHeader } from '@shared/config/jwt';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticação e gerenciamento de sessão
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Realiza login do usuário
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
 *                 example: diego.admin@helpme.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@1234
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       401:
 *         description: Email ou senha inválidos
 *       429:
 *         description: Muitas tentativas de login
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  const result = await loginUseCase(
    {
      email: req.body.email,
      password: req.body.password,
    },
    req,
    correlationId
  );

  return res.status(200).json(result);
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renova o access token usando o refresh token
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
 *       401:
 *         description: Refresh token inválido ou expirado
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  const result = await refreshTokenUseCase(
    { refreshToken: req.body.refreshToken },
    req,
    correlationId
  );

  return res.status(200).json(result);
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Realiza logout invalidando os tokens
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *       401:
 *         description: Não autenticado
 */
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const token = extractTokenFromHeader(req.headers.authorization) ?? '';

  await logoutUseCase(
    {
      usuarioId: req.usuario!.id,
      accessToken: token,
    },
    req,
    correlationId
  );

  return res.status(200).json({ message: 'Logout realizado com sucesso.' });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retorna dados do usuário autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário autenticado
 *       401:
 *         description: Não autenticado
 */
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  return res.status(200).json({ usuario: req.usuario });
});

export default router;