import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { cacheSet } from '../services/redisClient';

const prisma = new PrismaClient();
const router = Router();

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

router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  // Blacklist do JWT
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded === 'object' && decoded.jti && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000); // TTL segundos
      await cacheSet(`jwt:blacklist:${decoded.jti}`, 'revogado', ttl);
    }
  }

  // Remove refreshToken do usuário
  await prisma.usuario.update({
    where: { id: req.usuario.id },
    data: { refreshToken: null },
  });

  // Invalida a sessão do usuário no Redis
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao encerrar a sessão.' });
    }
    res.json({ message: 'Logout realizado com sucesso.' });
  });
});

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
