import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Criar um novo serviço
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do serviço é obrigatório.' });
    }

    const existing = await prisma.service.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Já existe um serviço com esse nome.' });
    }

    const service = await prisma.service.create({
      data: { name: name.trim(), description },
    });

    return res.status(201).json(service);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Listar todos os serviços (ativos por padrão)
router.get('/', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req, res) => {
  try {
    const { incluirInativos } = req.query;
    const showInactive = incluirInativos === 'true';

    const services = await prisma.service.findMany({
      where: showInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });

    return res.json(services);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao listar serviços.' });
  }
});

// Buscar serviço específico por ID
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req, res) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    return res.json(service);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Editar serviço
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    const updated = await prisma.service.update({
      where: { id },
      data: {
        name: name?.trim() || service.name,
        description: description ?? service.description,
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

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (!service.isActive) {
      return res.status(400).json({ error: 'O serviço já está desativado.' });
    }

    await prisma.service.update({
      where: { id },
      data: { isActive: false },
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

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (service.isActive) {
      return res.status(400).json({ error: 'O serviço já está ativo.' });
    }

    const reactivated = await prisma.service.update({
      where: { id },
      data: { isActive: true },
    });

    return res.json({ message: 'Serviço reativado com sucesso.', service: reactivated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Excluir serviço permanentemente (Hard Delete)
router.delete('/:id/excluir', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    await prisma.service.delete({ where: { id } });

    return res.json({ message: 'Serviço removido permanentemente do banco de dados.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
