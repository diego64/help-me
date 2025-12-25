import { Router } from 'express';
import { prisma } from '../lib/prisma';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Serviços
 *   description: Gerenciamento de serviços disponíveis para abertura de chamados
 */

// ========================================
// CRIAÇÃO DE SERVIÇO
// ========================================

/**
 * @swagger
 * /api/servicos:
 *   post:
 *     summary: Cria um novo serviço
 *     description: Cadastra um novo serviço no sistema. O nome do serviço deve ser único. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
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
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome do serviço (único)
 *               descricao:
 *                 type: string
 *                 description: Descrição do serviço (opcional)
 *     responses:
 *       201:
 *         description: Serviço criado com sucesso
 *       400:
 *         description: Nome do serviço não fornecido ou erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       409:
 *         description: Já existe um serviço com esse nome
 */
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

// ========================================
// LISTAGEM DOS SERVIÇOS ATIVOS
// ========================================

/**
 * @swagger
 * /api/servicos:
 *   get:
 *     summary: Lista os serviços cadastrados
 *     description: Retorna todos os serviços ativos por padrão. Use o parâmetro incluirInativos=true para exibir também os serviços desativados. Requer autenticação e perfil ADMIN ou USUARIO.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *         description: Se true, inclui serviços inativos na listagem
 *     responses:
 *       200:
 *         description: Lista de serviços retornada com sucesso
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
 *                   descricao:
 *                     type: string
 *                     nullable: true
 *                   ativo:
 *                     type: boolean
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO)
 *       500:
 *         description: Erro ao listar serviços
 */
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

// ========================================
// BUSCA DE UM SERVIÇO ESPECÍFICO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}:
 *   get:
 *     summary: Busca um serviço por ID
 *     description: Retorna os detalhes de um serviço específico. Requer autenticação e perfil ADMIN ou USUARIO.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço encontrado
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
 *                 descricao:
 *                   type: string
 *                   nullable: true
 *                 ativo:
 *                   type: boolean
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou USUARIO)
 *       404:
 *         description: Serviço não encontrado
 */
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

// ========================================
// EDIÇÃO DE UM SERVIÇO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}:
 *   put:
 *     summary: Atualiza os dados de um serviço
 *     description: Permite editar o nome e/ou descrição de um serviço existente. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do serviço a ser atualizado
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Novo nome do serviço
 *               descricao:
 *                 type: string
 *                 description: Nova descrição do serviço
 *     responses:
 *       200:
 *         description: Serviço atualizado com sucesso
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Serviço não encontrado
 */
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

// ========================================
// DESATIVAÇÃO DO SERVIÇO (SOFT DELETE)
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/desativar:
 *   delete:
 *     summary: Desativa um serviço (soft delete)
 *     description: Marca o serviço como inativo sem removê-lo do banco de dados. Serviços inativos não aparecem na listagem padrão e não podem ser usados para abrir novos chamados. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do serviço a ser desativado
 *     responses:
 *       200:
 *         description: Serviço desativado com sucesso
 *       400:
 *         description: Serviço já está desativado ou erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Serviço não encontrado
 */
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

// ========================================
// REATIVAÇÃO DO SERVIÇO (OPCIONAL)
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/reativar:
 *   patch:
 *     summary: Reativa um serviço desativado
 *     description: Marca o serviço como ativo novamente, permitindo que seja usado para abrir novos chamados. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do serviço a ser reativado
 *     responses:
 *       200:
 *         description: Serviço reativado com sucesso
 *       400:
 *         description: Serviço já está ativo ou erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Serviço não encontrado
 */
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

// ========================================
// EXCLUSÃO DO SERVIÇO (HARD DELETE)
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/excluir:
 *   delete:
 *     summary: Exclui permanentemente um serviço (hard delete)
 *     description: Remove o serviço definitivamente do banco de dados. Esta ação é irreversível e pode falhar se houver chamados vinculados ao serviço. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do serviço a ser excluído
 *     responses:
 *       200:
 *         description: Serviço removido permanentemente
 *       400:
 *         description: Erro ao excluir serviço (pode haver chamados vinculados)
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Serviço não encontrado
 */
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