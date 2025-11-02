import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Criar um novo serviço
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { nome, descricao } = req.body;

    if (!nome || nome.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do serviço é obrigatório.' });
    }

    const verificarServico = await prisma.servico.findUnique({ where: { nome } });
    if (verificarServico) {
      return res.status(409).json({ error: 'Já existe um serviço com esse nome.' });
    }

    const servico = await prisma.servico.create({
      data: { nome: nome.trim(), descricao },
    });

    return res.status(201).json(servico);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Listar os serviços ativos
router.get('/', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req, res) => {
  try {
    const { incluirInativos } = req.query;
    const exibirInativos = incluirInativos === 'true';

    const servicos = await prisma.servico.findMany({
      where: exibirInativos ? {} : { ativo: true },
      orderBy: { nome: 'asc' },
    });

    return res.json(servicos);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao listar serviços.' });
  }
});

// Buscar serviço específico por ID
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req, res) => {
  try {
    const { id } = req.params;

    const servico = await prisma.servico.findUnique({ where: { id } });
    if (!servico) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    return res.json(servico);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Editar serviço
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao } = req.body;

    const servico = await prisma.servico.findUnique({ where: { id } });
    if (!servico) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    const updated = await prisma.servico.update({
      where: { id },
      data: {
        nome: nome?.trim() || servico.nome,
        descricao: descricao ?? servico.descricao,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Desativar serviço (Soft Delete)
router.delete('/:id/desativar', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const servico = await prisma.servico.findUnique({ where: { id } });
    if (!servico) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (!servico.ativo) {
      return res.status(400).json({ error: 'O serviço já está desativado.' });
    }

    await prisma.servico.update({
      where: { id },
      data: { ativo: false },
    });

    return res.json({ message: 'Serviço desativado com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Reativar serviço (opcional)
router.patch('/:id/reativar', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const servico = await prisma.servico.findUnique({ where: { id } });
    if (!servico) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (servico.ativo) {
      return res.status(400).json({ error: 'O serviço já está ativo.' });
    }

    const reactivated = await prisma.servico.update({
      where: { id },
      data: { ativo: true },
    });

    return res.json({ message: 'Serviço reativado com sucesso.', servico: reactivated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Excluir serviço permanentemente (Hard Delete)
router.delete('/:id/excluir', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const servico = await prisma.servico.findUnique({ where: { id } });
    if (!servico) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    await prisma.servico.delete({ where: { id } });

    return res.json({ message: 'Serviço removido permanentemente do banco de dados.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
