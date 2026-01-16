import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ChamadoStatus } from '@prisma/client';
import { 
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';
import {
  salvarHistoricoChamado,
  listarHistoricoChamado
} from '../repositories/chamadoAtualizacao.repository';
import ChamadoAtualizacaoModel from '../models/chamadoAtualizacao.model';

export const router: Router = Router();

const MIN_DESCRICAO_LENGTH = 10;
const MAX_DESCRICAO_LENGTH = 5000;
const REABERTURA_PRAZO_HORAS = 48;
const OS_PREFIX = 'INC';
const OS_PADDING = 4;

interface ServicoSimples {
  id: string;
  nome: string;
}

function validarDescricao(descricao: string): { valida: boolean; erro?: string } {
  if (!descricao || typeof descricao !== 'string') {
    return { valida: false, erro: 'Descrição é obrigatória' };
  }

  const descricaoLimpa = descricao.trim();

  if (descricaoLimpa.length < MIN_DESCRICAO_LENGTH) {
    return { 
      valida: false, 
      erro: `Descrição deve ter no mínimo ${MIN_DESCRICAO_LENGTH} caracteres` 
    };
  }

  if (descricaoLimpa.length > MAX_DESCRICAO_LENGTH) {
    return { 
      valida: false, 
      erro: `Descrição deve ter no máximo ${MAX_DESCRICAO_LENGTH} caracteres` 
    };
  }

  return { valida: true };
}

function normalizarServicos(servico: any): string[] {
  if (servico == null) return [];
  
  if (Array.isArray(servico)) {
    return servico
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  
  if (typeof servico === 'string') {
    const nome = servico.trim();
    return nome.length > 0 ? [nome] : [];
  }
  
  return [];
}

async function verificarExpedienteTecnico(tecnicoId: string): Promise<boolean> {
  const expedientes = await prisma.expediente.findMany({
    where: { 
      usuarioId: tecnicoId,
      ativo: true,
      deletadoEm: null,
    },
    select: {
      entrada: true,
      saida: true,
    },
  });

  if (!expedientes.length) return false;

  const agora = new Date();
  const horaAtual = agora.getHours() + agora.getMinutes() / 60;

  return expedientes.some(exp => {
    const entrada = new Date(exp.entrada);
    const saida = new Date(exp.saida);
    
    const horarioEntrada = entrada.getHours() + entrada.getMinutes() / 60;
    const horarioSaida = saida.getHours() + saida.getMinutes() / 60;
    
    return horaAtual >= horarioEntrada && horaAtual <= horarioSaida;
  });
}

async function gerarNumeroOS(): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const ultimoChamado = await tx.chamado.findFirst({
      where: {
        OS: {
          startsWith: OS_PREFIX,
        },
      },
      orderBy: { 
        OS: 'desc' 
      },
      select: { 
        OS: true 
      },
    });

    let novoNumero = 1;

    if (ultimoChamado?.OS) {
      const numeroAnterior = parseInt(
        ultimoChamado.OS.replace(OS_PREFIX, ''), 
        10
      );
      
      if (!isNaN(numeroAnterior)) {
        novoNumero = numeroAnterior + 1;
      }
    }

    const numeroFormatado = String(novoNumero).padStart(OS_PADDING, '0');
    return `${OS_PREFIX}${numeroFormatado}`;
  });
}

async function buscarUltimoTecnico(chamadoId: string): Promise<string | null> {
  try {
    const historicoTecnico = await ChamadoAtualizacaoModel.findOne(
      {
        chamadoId,
        tipo: 'STATUS',
        para: 'EM_ATENDIMENTO',
      },
      { autorId: 1 },
      { sort: { dataHora: -1 } }
    );

    return historicoTecnico?.autorId || null;
  } catch (error) {
    console.error('[BUSCAR TECNICO ERROR]', error);
    return null;
  }
}

function formatarChamadoResposta(chamado: any) {
  return {
    id: chamado.id,
    OS: chamado.OS,
    descricao: chamado.descricao,
    descricaoEncerramento: chamado.descricaoEncerramento,
    status: chamado.status,
    geradoEm: chamado.geradoEm,
    atualizadoEm: chamado.atualizadoEm,
    encerradoEm: chamado.encerradoEm,
    usuario: chamado.usuario ? {
      id: chamado.usuario.id,
      nome: chamado.usuario.nome,
      sobrenome: chamado.usuario.sobrenome,
      email: chamado.usuario.email,
    } : null,
    tecnico: chamado.tecnico ? {
      id: chamado.tecnicoId,
      nome: chamado.tecnico.nome,
      email: chamado.tecnico.email,
    } : null,
    servicos: chamado.servicos?.map((s: any) => ({
      id: s.servico.id,
      nome: s.servico.nome,
    })) || [],
  };
}

/**
 * @swagger
 * tags:
 *   name: Chamados
 *   description: Gerenciamento de chamados de suporte
 */

/**
 * @swagger
 * /api/chamados/abertura-chamado:
 *   post:
 *     summary: Abre um novo chamado de suporte
 *     description: Cria um novo chamado vinculado a um ou mais serviços. Gera automaticamente um número de OS (Ordem de Serviço) no formato INC0001. Requer autenticação e perfil USUARIO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - descricao
 *               - servico
 *             properties:
 *               descricao:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *                 description: Descrição detalhada do problema
 *                 example: Computador não liga após atualização do Windows
 *               servico:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *                 description: Nome do serviço ou array de nomes de serviços
 *                 example: Suporte Técnico Geral
 *     responses:
 *       201:
 *         description: Chamado criado com sucesso
 *       400:
 *         description: Dados inválidos ou serviço não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil USUARIO)
 *       500:
 *         description: Erro ao criar o chamado
 */
router.post(
  '/abertura-chamado',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const { descricao, servico } = req.body;

      const validacao = validarDescricao(descricao);
      if (!validacao.valida) {
        return res.status(400).json({ error: validacao.erro });
      }

      const servicosArray = normalizarServicos(servico);
      
      if (!servicosArray.length) {
        return res.status(400).json({
          error: 'É obrigatório informar pelo menos um serviço válido',
        });
      }

      // Buscar serviços em paralelo com geração do OS
      const [encontrarServico, OS] = await Promise.all([
        prisma.servico.findMany({
          where: {
            nome: { in: servicosArray },
            ativo: true,
            deletadoEm: null,
          },
          select: { 
            id: true, 
            nome: true 
          },
        }),
        gerarNumeroOS(),
      ]);

      // Verificar serviços não encontrados
      const nomesEncontrados = encontrarServico.map((s) => s.nome);
      const nomesNaoEncontrados = servicosArray.filter(
        (n) => !nomesEncontrados.includes(n)
      );

      if (nomesNaoEncontrados.length > 0) {
        return res.status(400).json({
          error: `Serviços não encontrados ou inativos: ${nomesNaoEncontrados.join(', ')}`,
        });
      }

      const chamado = await prisma.$transaction(async (tx) => {
        const novoChamado = await tx.chamado.create({
          data: {
            OS,
            descricao: descricao.trim(),
            usuarioId: req.usuario!.id,
            status: ChamadoStatus.ABERTO,
            servicos: {
              create: encontrarServico.map((servico) => ({
                servico: { connect: { id: servico.id } },
              })),
            },
          },
          include: {
            usuario: {
              select: { 
                id: true, 
                nome: true,
                sobrenome: true,
                email: true 
              },
            },
            servicos: {
              include: { 
                servico: { 
                  select: { 
                    id: true,
                    nome: true 
                  } 
                } 
              },
            },
          },
        });

        return novoChamado;
      });

      salvarHistoricoChamado({
        chamadoId: chamado.id,
        tipo: 'ABERTURA',
        de: undefined,
        para: ChamadoStatus.ABERTO,
        descricao: chamado.descricao,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => {
        console.error('[SAVE HISTORICO ERROR]', err);
      });

      return res.status(201).json(formatarChamadoResposta(chamado));
    } catch (err: any) {
      console.error('[CHAMADO CREATE ERROR]', err);
      return res.status(500).json({ 
        error: 'Erro ao criar o chamado' 
      });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/status:
 *   patch:
 *     summary: Atualiza o status de um chamado
 *     description: Permite alterar o status do chamado para EM_ATENDIMENTO, ENCERRADO ou CANCELADO. Técnicos só podem assumir chamados dentro do horário de expediente. Chamados encerrados requerem descrição de encerramento. Técnicos não podem cancelar chamados. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [EM_ATENDIMENTO, ENCERRADO, CANCELADO]
 *               descricaoEncerramento:
 *                 type: string
 *                 minLength: 10
 *               atualizacaoDescricao:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status atualizado com sucesso
 *       400:
 *         description: Status inválido ou falta descrição de encerramento
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão ou fora do horário de expediente
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao atualizar status
 */
router.patch(
  '/:id/status',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { status, descricaoEncerramento, atualizacaoDescricao } = req.body as {
        status: ChamadoStatus;
        descricaoEncerramento?: string;
        atualizacaoDescricao?: string;
      };

      const statusValidos: ChamadoStatus[] = [
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.ENCERRADO,
        ChamadoStatus.CANCELADO,
      ];

      if (!statusValidos.includes(status)) {
        return res.status(400).json({
          error: `Status inválido. Use: ${statusValidos.join(', ')}`,
        });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        include: {
          tecnico: { 
            select: { 
              id: true,
              nome: true, 
              email: true 
            } 
          },
          usuario: {
            select: { 
              id: true, 
              nome: true, 
              sobrenome: true, 
              email: true 
            },
          },
          servicos: {
            include: {
              servico: {
                select: { 
                  id: true, 
                  nome: true 
                },
              },
            },
          },
        },
      });

      if (!chamado) {
        return res.status(404).json({ 
          error: 'Chamado não encontrado' 
        });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({
          error: 'Chamados cancelados não podem ser alterados',
        });
      }

      if (
        chamado.status === ChamadoStatus.ENCERRADO &&
        req.usuario!.regra === 'TECNICO'
      ) {
        return res.status(403).json({
          error: 'Chamados encerrados não podem ser alterados por técnicos',
        });
      }

      if (
        req.usuario!.regra === 'TECNICO' &&
        status === ChamadoStatus.CANCELADO
      ) {
        return res.status(403).json({
          error: 'Técnicos não podem cancelar chamados',
        });
      }

      // Preparar dados para atualização
      const dataToUpdate: any = {
        status,
        atualizadoEm: new Date(),
      };

      // Validações específicas por status
      if (status === ChamadoStatus.ENCERRADO) {
        const validacao = validarDescricao(descricaoEncerramento || '');
        if (!validacao.valida) {
          return res.status(400).json({
            error: 'Descrição de encerramento inválida: ' + validacao.erro,
          });
        }

        dataToUpdate.encerradoEm = new Date();
        dataToUpdate.descricaoEncerramento = descricaoEncerramento!.trim();
      }

      // Verificar expediente do técnico
      if (
        status === ChamadoStatus.EM_ATENDIMENTO &&
        req.usuario!.regra === 'TECNICO'
      ) {
        const dentroExpediente = await verificarExpedienteTecnico(
          req.usuario!.id
        );

        if (!dentroExpediente) {
          return res.status(403).json({
            error: 'Chamado só pode ser assumido dentro do horário de trabalho',
          });
        }

        dataToUpdate.tecnicoId = req.usuario!.id;
      }

      // Atualizar chamado em transação
      const chamadoAtualizado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: dataToUpdate,
          include: {
            tecnico: {
              select: { 
                id: true,
                nome: true, 
                email: true 
              },
            },
            usuario: {
              select: {
                id: true,
                nome: true,
                sobrenome: true,
                email: true,
              },
            },
            servicos: {
              include: {
                servico: {
                  select: { 
                    id: true, 
                    nome: true 
                  },
                },
              },
            },
          },
        });
      });

      // Salvar histórico (não bloquear resposta)
      const descricaoHistorico = atualizacaoDescricao?.trim() ||
        (status === ChamadoStatus.EM_ATENDIMENTO
          ? 'Chamado assumido pelo técnico'
          : status === ChamadoStatus.ENCERRADO
          ? 'Chamado encerrado'
          : status === ChamadoStatus.CANCELADO
          ? 'Chamado cancelado'
          : 'Alteração de status');

      salvarHistoricoChamado({
        chamadoId: chamadoAtualizado.id,
        tipo: 'STATUS',
        de: chamado.status,
        para: status,
        descricao: descricaoHistorico,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => {
        console.error('[SAVE HISTORICO ERROR]', err);
      });

      return res.status(200).json(formatarChamadoResposta(chamadoAtualizado));
    } catch (err: any) {
      console.error('[CHAMADO STATUS ERROR]', err);
      return res.status(500).json({
        error: 'Erro ao atualizar status do chamado',
      });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/historico:
 *   get:
 *     summary: Busca o histórico de atualizações de um chamado
 *     description: Retorna todas as alterações registradas no chamado (abertura, mudanças de status, reabertura, etc.). Os dados são armazenados no MongoDB. Requer autenticação.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado
 *     responses:
 *       200:
 *         description: Histórico retornado com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao buscar histórico
 */
router.get(
  '/:id/historico',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const historico = await listarHistoricoChamado(id);
      return res.status(200).json(historico);
    } catch (err: any) {
      console.error('[CHAMADO HISTORICO ERROR]', err);
      return res.status(500).json({ 
        error: 'Erro ao buscar histórico' 
      });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/reabrir-chamado:
 *   patch:
 *     summary: Reabre um chamado encerrado
 *     description: Permite que o usuário reabra seu próprio chamado encerrado dentro de 48 horas após o encerramento. O chamado volta ao status REABERTO e é reatribuído ao último técnico. Requer autenticação e perfil USUARIO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado a ser reaberto
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               atualizacaoDescricao:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: Chamado reaberto com sucesso
 *       400:
 *         description: Chamado não pode ser reaberto
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao reabrir chamado
 */
router.patch(
  '/:id/reabrir-chamado',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { atualizacaoDescricao } = req.body as {
        atualizacaoDescricao?: string;
      };

      // Buscar chamado
      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true,
          OS: true,
          descricao: true,
          status: true,
          usuarioId: true,
          tecnicoId: true,
          encerradoEm: true,
        },
      });

      if (!chamado) {
        return res.status(404).json({ 
          error: 'Chamado não encontrado' 
        });
      }

      // Validações de permissão
      if (chamado.usuarioId !== req.usuario!.id) {
        return res.status(403).json({
          error: 'Você só pode reabrir chamados criados por você',
        });
      }

      if (chamado.status !== ChamadoStatus.ENCERRADO) {
        return res.status(400).json({
          error: 'Somente chamados encerrados podem ser reabertos',
        });
      }

      if (!chamado.encerradoEm) {
        return res.status(400).json({
          error: 'Data de encerramento não encontrada',
        });
      }

      // Validar prazo de reabertura
      const encerradoEm = new Date(chamado.encerradoEm);
      const agora = new Date();
      const diffHoras = (agora.getTime() - encerradoEm.getTime()) / (1000 * 60 * 60);

      if (diffHoras > REABERTURA_PRAZO_HORAS) {
        return res.status(400).json({
          error: `Só é possível reabrir até ${REABERTURA_PRAZO_HORAS} horas após o encerramento`,
        });
      }

      // Buscar último técnico se necessário
      let tecnicoId = chamado.tecnicoId;
      if (!tecnicoId) {
        tecnicoId = await buscarUltimoTecnico(chamado.id);
      }

      const chamadoAtualizado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: {
            status: ChamadoStatus.REABERTO,
            atualizadoEm: new Date(),
            encerradoEm: null,
            descricaoEncerramento: null,
            tecnicoId: tecnicoId || null,
          },
          include: {
            tecnico: {
              select: { 
                id: true,
                nome: true, 
                email: true 
              },
            },
            usuario: {
              select: {
                id: true,
                nome: true,
                sobrenome: true,
                email: true,
              },
            },
            servicos: {
              include: {
                servico: {
                  select: { 
                    id: true, 
                    nome: true 
                  },
                },
              },
            },
          },
        });
      });

      // Salvar histórico
      const descricaoHistorico = atualizacaoDescricao?.trim() ||
        'Chamado reaberto pelo usuário dentro do prazo';

      ChamadoAtualizacaoModel.create({
        chamadoId: chamadoAtualizado.id,
        dataHora: new Date(),
        tipo: 'REABERTURA',
        de: ChamadoStatus.ENCERRADO,
        para: ChamadoStatus.REABERTO,
        descricao: descricaoHistorico,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => {
        console.error('[SAVE HISTORICO ERROR]', err);
      });

      return res.status(200).json(formatarChamadoResposta(chamadoAtualizado));
    } catch (err: any) {
      console.error('[CHAMADO REABRIR ERROR]', err);
      return res.status(500).json({ 
        error: 'Erro ao reabrir chamado' 
      });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/cancelar-chamado:
 *   patch:
 *     summary: Cancela um chamado
 *     description: Permite que o usuário que criou o chamado ou um ADMIN cancele o chamado. Requer justificativa. Chamados encerrados não podem ser cancelados.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado a ser cancelado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - descricaoEncerramento
 *             properties:
 *               descricaoEncerramento:
 *                 type: string
 *                 minLength: 10
 *                 description: Justificativa do cancelamento
 *     responses:
 *       200:
 *         description: Chamado cancelado com sucesso
 *       400:
 *         description: Chamado já cancelado, encerrado ou falta justificativa
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão para cancelar este chamado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao cancelar chamado
 */
router.patch(
  '/:id/cancelar-chamado',
  authMiddleware,
  authorizeRoles('USUARIO', 'ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { descricaoEncerramento } = req.body;

      // Validar descrição
      const validacao = validarDescricao(descricaoEncerramento);
      if (!validacao.valida) {
        return res.status(400).json({
          error: 'Justificativa do cancelamento inválida: ' + validacao.erro,
        });
      }

      // Buscar chamado
      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true,
          OS: true,
          status: true,
          usuarioId: true,
        },
      });

      if (!chamado) {
        return res.status(404).json({ 
          error: 'Chamado não encontrado' 
        });
      }

      if (
        req.usuario!.regra === 'USUARIO' &&
        chamado.usuarioId !== req.usuario!.id
      ) {
        return res.status(403).json({
          error: 'Você não tem permissão para cancelar este chamado',
        });
      }

      if (chamado.status === ChamadoStatus.ENCERRADO) {
        return res.status(400).json({
          error: 'Não é possível cancelar um chamado encerrado',
        });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({
          error: 'Este chamado já está cancelado',
        });
      }

      const chamadoCancelado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: {
            status: ChamadoStatus.CANCELADO,
            descricaoEncerramento: descricaoEncerramento.trim(),
            encerradoEm: new Date(),
            atualizadoEm: new Date(),
          },
          include: {
            usuario: {
              select: {
                id: true,
                nome: true,
                sobrenome: true,
                email: true,
              },
            },
            servicos: {
              include: {
                servico: {
                  select: { 
                    id: true, 
                    nome: true 
                  },
                },
              },
            },
          },
        });
      });

      salvarHistoricoChamado({
        chamadoId: chamadoCancelado.id,
        tipo: 'CANCELAMENTO',
        de: chamado.status,
        para: ChamadoStatus.CANCELADO,
        descricao: descricaoEncerramento.trim(),
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => {
        console.error('[SAVE HISTORICO ERROR]', err);
      });

      return res.status(200).json({
        message: 'Chamado cancelado com sucesso',
        chamado: formatarChamadoResposta(chamadoCancelado),
      });
    } catch (err: any) {
      console.error('[CHAMADO CANCELAR ERROR]', err);
      return res.status(500).json({ 
        error: 'Erro ao cancelar o chamado' 
      });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}:
 *   delete:
 *     summary: Desativa um chamado (soft delete)
 *     description: Marca o chamado como deletado sem removê-lo permanentemente do banco. Requer autenticação e perfil ADMIN.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado
 *       - in: query
 *         name: permanente
 *         schema:
 *           type: boolean
 *         description: Se true, deleta permanentemente (USE COM CUIDADO!)
 *     responses:
 *       200:
 *         description: Chamado desativado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao deletar chamado
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const permanente = req.query.permanente === 'true';

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true,
          OS: true,
          status: true,
        },
      });

      if (!chamado) {
        return res.status(404).json({ 
          error: 'Chamado não encontrado' 
        });
      }

      if (permanente) {
        await prisma.$transaction(async (tx) => {
          // Deletar ordens de serviço primeiro
          await tx.ordemDeServico.deleteMany({
            where: { chamadoId: id },
          });

          // Deletar chamado
          await tx.chamado.delete({
            where: { id },
          });
        });

        return res.json({
          message: `Chamado ${chamado.OS} excluído permanentemente`,
          id,
        });
      }

      // SOFT DELETE (Recomendado)
      await prisma.chamado.update({
        where: { id },
        data: {
          deletadoEm: new Date(),
        },
      });

      res.json({
        message: `Chamado ${chamado.OS} desativado com sucesso`,
        id,
      });
    } catch (err: any) {
      console.error('[CHAMADO DELETE ERROR]', err);
      return res.status(500).json({ 
        error: 'Erro ao deletar o chamado' 
      });
    }
  }
);

export default router;