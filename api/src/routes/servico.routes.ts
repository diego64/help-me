import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

const MIN_NOME_LENGTH = 3;
const MAX_NOME_LENGTH = 100;
const MAX_DESCRICAO_LENGTH = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

interface ListagemResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function validarNome(nome: string): { valido: boolean; erro?: string } {
  if (!nome || typeof nome !== 'string') {
    return { valido: false, erro: 'Nome é obrigatório' };
  }

  const nomeLimpo = nome.trim();

  if (nomeLimpo.length < MIN_NOME_LENGTH) {
    return {
      valido: false,
      erro: `Nome deve ter no mínimo ${MIN_NOME_LENGTH} caracteres`,
    };
  }

  if (nomeLimpo.length > MAX_NOME_LENGTH) {
    return {
      valido: false,
      erro: `Nome deve ter no máximo ${MAX_NOME_LENGTH} caracteres`,
    };
  }

  return { valido: true };
}

function validarDescricao(descricao: string | undefined): { valido: boolean; erro?: string } {
  if (!descricao) return { valido: true };

  if (descricao.length > MAX_DESCRICAO_LENGTH) {
    return {
      valido: false,
      erro: `Descrição deve ter no máximo ${MAX_DESCRICAO_LENGTH} caracteres`,
    };
  }

  return { valido: true };
}

function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): ListagemResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

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
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Nome do serviço (único)
 *                 example: Suporte Técnico Geral
 *               descricao:
 *                 type: string
 *                 maxLength: 500
 *                 description: Descrição do serviço
 *                 example: Suporte para problemas gerais de TI
 *     responses:
 *       201:
 *         description: Serviço criado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       409:
 *         description: Serviço já existe
 *       500:
 *         description: Erro ao criar serviço
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { nome, descricao } = req.body;

      const validacaoNome = validarNome(nome);
      if (!validacaoNome.valido) {
        return res.status(400).json({ error: validacaoNome.erro });
      }

      const validacaoDescricao = validarDescricao(descricao);
      if (!validacaoDescricao.valido) {
        return res.status(400).json({ error: validacaoDescricao.erro });
      }

      const nomeLimpo = nome.trim();

      // Verificar se já existe (considerando soft delete)
      const servicoExistente = await prisma.servico.findUnique({
        where: { nome: nomeLimpo },
        select: {
          id: true,
          nome: true,
          ativo: true,
          deletadoEm: true,
        },
      });

      if (servicoExistente) {
        if (servicoExistente.deletadoEm) {
          return res.status(409).json({
            error: 'Já existe um serviço deletado com esse nome. Use a rota de reativação.',
            servicoId: servicoExistente.id,
          });
        }
        return res.status(409).json({
          error: 'Já existe um serviço com esse nome',
        });
      }

      const servico = await prisma.servico.create({
        data: {
          nome: nomeLimpo,
          descricao: descricao?.trim() || null,
        },
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
        },
      });

      console.log('[SERVICO CREATED]', { id: servico.id, nome: servico.nome });

      res.status(201).json(servico);
    } catch (err: any) {
      console.error('[SERVICO CREATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao criar serviço',
      });
    }
  }
);

// ========================================
// LISTAGEM DE SERVIÇOS (COM PAGINAÇÃO)
// ========================================

/**
 * @swagger
 * /api/servicos:
 *   get:
 *     summary: Lista os serviços cadastrados
 *     description: Retorna todos os serviços com paginação e filtros. Por padrão, retorna apenas serviços ativos. Requer autenticação.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *         description: Incluir serviços inativos
 *       - in: query
 *         name: incluirDeletados
 *         schema:
 *           type: boolean
 *         description: Incluir serviços deletados (soft delete)
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Buscar em nome ou descrição
 *     responses:
 *       200:
 *         description: Lista de serviços retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao listar serviços
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { incluirInativos, incluirDeletados, busca } = req.query;

      const where: any = {};

      if (incluirInativos !== 'true') {
        where.ativo = true;
      }

      if (incluirDeletados !== 'true') {
        where.deletadoEm = null;
      }

      if (busca && typeof busca === 'string') {
        where.OR = [
          { nome: { contains: busca, mode: 'insensitive' } },
          { descricao: { contains: busca, mode: 'insensitive' } },
        ];
      }

      const [total, servicos] = await Promise.all([
        prisma.servico.count({ where }),
        prisma.servico.findMany({
          where,
          select: {
            id: true,
            nome: true,
            descricao: true,
            ativo: true,
            geradoEm: true,
            atualizadoEm: true,
            deletadoEm: true,
            _count: {
              select: {
                chamados: true,
              },
            },
          },
          orderBy: { nome: 'asc' },
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(servicos, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[SERVICO LIST ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar serviços',
      });
    }
  }
);

// ========================================
// BUSCA DE UM SERVIÇO ESPECÍFICO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}:
 *   get:
 *     summary: Busca um serviço por ID
 *     description: Retorna os detalhes de um serviço específico. Requer autenticação.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço encontrado
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao buscar serviço
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN', 'USUARIO', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
          deletadoEm: true,
          _count: {
            select: {
              chamados: {
                where: { deletadoEm: null },
              },
            },
          },
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      res.json(servico);
    } catch (err: any) {
      console.error('[SERVICO GET ERROR]', err);
      res.status(500).json({
        error: 'Erro ao buscar serviço',
      });
    }
  }
);

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
 *         description: ID do serviço
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               descricao:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Serviço atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       409:
 *         description: Nome já está em uso
 *       500:
 *         description: Erro ao atualizar serviço
 */
router.put(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { nome, descricao } = req.body;

      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          deletadoEm: true,
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      if (servico.deletadoEm) {
        return res.status(400).json({
          error: 'Não é possível editar um serviço deletado',
        });
      }

      const dataToUpdate: any = {};

      if (nome !== undefined) {
        const validacaoNome = validarNome(nome);
        if (!validacaoNome.valido) {
          return res.status(400).json({ error: validacaoNome.erro });
        }

        const nomeLimpo = nome.trim();

        // Verificar se o novo nome já existe (em outro serviço)
        if (nomeLimpo !== servico.nome) {
          const nomeExistente = await prisma.servico.findUnique({
            where: { nome: nomeLimpo },
          });

          if (nomeExistente && nomeExistente.id !== id) {
            return res.status(409).json({
              error: 'Já existe outro serviço com esse nome',
            });
          }

          dataToUpdate.nome = nomeLimpo;
        }
      }

      if (descricao !== undefined) {
        const validacaoDescricao = validarDescricao(descricao);
        if (!validacaoDescricao.valido) {
          return res.status(400).json({ error: validacaoDescricao.erro });
        }

        dataToUpdate.descricao = descricao?.trim() || null;
      }

      if (Object.keys(dataToUpdate).length === 0) {
        return res.json(servico);
      }

      const updated = await prisma.servico.update({
        where: { id },
        data: dataToUpdate,
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
        },
      });

      console.log('[SERVICO UPDATED]', { id: updated.id, nome: updated.nome });

      res.json(updated);
    } catch (err: any) {
      console.error('[SERVICO UPDATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao atualizar serviço',
      });
    }
  }
);

// ========================================
// DESATIVAÇÃO DO SERVIÇO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/desativar:
 *   patch:
 *     summary: Desativa um serviço
 *     description: Marca o serviço como inativo. Serviços inativos não aparecem na listagem padrão. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço desativado com sucesso
 *       400:
 *         description: Serviço já está desativado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao desativar serviço
 */
router.patch(
  '/:id/desativar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          ativo: true,
          deletadoEm: true,
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      if (!servico.ativo) {
        return res.status(400).json({
          error: 'Serviço já está desativado',
        });
      }

      await prisma.servico.update({
        where: { id },
        data: { ativo: false },
      });

      console.log('[SERVICO DEACTIVATED]', { id, nome: servico.nome });

      res.json({
        message: 'Serviço desativado com sucesso',
        id,
      });
    } catch (err: any) {
      console.error('[SERVICO DEACTIVATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao desativar serviço',
      });
    }
  }
);

// ========================================
// REATIVAÇÃO DO SERVIÇO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/reativar:
 *   patch:
 *     summary: Reativa um serviço desativado
 *     description: Marca o serviço como ativo novamente. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço reativado com sucesso
 *       400:
 *         description: Serviço já está ativo ou está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao reativar serviço
 */
router.patch(
  '/:id/reativar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          ativo: true,
          deletadoEm: true,
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      if (servico.deletadoEm) {
        return res.status(400).json({
          error: 'Não é possível reativar um serviço deletado. Use a rota de restauração.',
        });
      }

      if (servico.ativo) {
        return res.status(400).json({
          error: 'Serviço já está ativo',
        });
      }

      const reativado = await prisma.servico.update({
        where: { id },
        data: { ativo: true },
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
        },
      });

      console.log('[SERVICO REACTIVATED]', { id, nome: servico.nome });

      res.json({
        message: 'Serviço reativado com sucesso',
        servico: reativado,
      });
    } catch (err: any) {
      console.error('[SERVICO REACTIVATE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao reativar serviço',
      });
    }
  }
);

// ========================================
// SOFT DELETE DO SERVIÇO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}:
 *   delete:
 *     summary: Deleta um serviço (soft delete)
 *     description: Marca o serviço como deletado sem removê-lo permanentemente. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do serviço
 *       - in: query
 *         name: permanente
 *         schema:
 *           type: boolean
 *         description: Se true, deleta permanentemente (USE COM CUIDADO!)
 *     responses:
 *       200:
 *         description: Serviço deletado com sucesso
 *       400:
 *         description: Serviço tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao deletar serviço
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const permanente = req.query.permanente === 'true';

      // Buscar serviço com contagem de chamados
      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          ativo: true,
          deletadoEm: true,
          _count: {
            select: {
              chamados: {
                where: { deletadoEm: null },
              },
            },
          },
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      if (permanente) {
        if (servico._count.chamados > 0) {
          return res.status(400).json({
            error: `Não é possível deletar permanentemente. Existem ${servico._count.chamados} chamados vinculados.`,
          });
        }

        await prisma.servico.delete({
          where: { id },
        });

        console.log('[SERVICO DELETED PERMANENTLY]', { id, nome: servico.nome });

        return res.json({
          message: 'Serviço removido permanentemente',
          id,
        });
      }

      await prisma.servico.update({
        where: { id },
        data: {
          deletadoEm: new Date(),
          ativo: false,
        },
      });

      console.log('[SERVICO SOFT DELETED]', { id, nome: servico.nome });

      res.json({
        message: 'Serviço deletado com sucesso',
        id,
      });
    } catch (err: any) {
      console.error('[SERVICO DELETE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao deletar serviço',
      });
    }
  }
);

// ========================================
// RESTAURAR SERVIÇO DELETADO
// ========================================

/**
 * @swagger
 * /api/servicos/{id}/restaurar:
 *   patch:
 *     summary: Restaura um serviço deletado (soft delete)
 *     description: Remove a marcação de deleção de um serviço. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço restaurado com sucesso
 *       400:
 *         description: Serviço não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao restaurar serviço
 */
router.patch(
  '/:id/restaurar',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const servico = await prisma.servico.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          deletadoEm: true,
        },
      });

      if (!servico) {
        return res.status(404).json({
          error: 'Serviço não encontrado',
        });
      }

      if (!servico.deletadoEm) {
        return res.status(400).json({
          error: 'Serviço não está deletado',
        });
      }

      const restaurado = await prisma.servico.update({
        where: { id },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
          descricao: true,
          ativo: true,
          geradoEm: true,
          atualizadoEm: true,
        },
      });

      console.log('[SERVICO RESTORED]', { id, nome: servico.nome });

      res.json({
        message: 'Serviço restaurado com sucesso',
        servico: restaurado,
      });
    } catch (err: any) {
      console.error('[SERVICO RESTORE ERROR]', err);
      res.status(500).json({
        error: 'Erro ao restaurar serviço',
      });
    }
  }
);

export default router;