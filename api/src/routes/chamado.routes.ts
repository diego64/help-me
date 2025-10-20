import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Função auxiliar para gerar número de OS
async function gerarNumeroOS(): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const ultimoChamado = await tx.chamado.findFirst({
      orderBy: { geradoEm: 'desc' },
      select: { OS: true },
    });

    let novoNumero = 1;

    if (ultimoChamado?.OS) {
      const numeroAnterior = parseInt(ultimoChamado.OS.replace('INC', ''), 10);
      novoNumero = numeroAnterior + 1;
    }

    const numeroFormatado = String(novoNumero).padStart(4, '0');
    const novoOS = `INC${numeroFormatado}`;

    const existente = await tx.chamado.findUnique({
      where: { OS: novoOS },
    });

    if (existente) {
      return gerarNumeroOS();
    }

    return novoOS;
  });
}

/**
 * Abertura do chamado
 * - Apenas USUARIO e ADMIN podem abrir
 * - Status padrão: ABERTO
 */
router.post('/abertura-chamado', authMiddleware, authorizeRoles('USUARIO', 'ADMIN'), async (req: AuthRequest, res) => {
    try {
      const { descricao, servico } = req.body;

      if (!descricao || typeof descricao !== 'string' || descricao.trim().length === 0) {
        return res.status(400).json({ error: 'A descrição do chamado é obrigatória.' });
      }

      // Agrupamento do "servico"
      let servicosArray: string[] = [];

      if (servico == null) {
        // null ou undefined → nenhum serviço informado
        servicosArray = [];
      } else if (Array.isArray(servico)) {
        // array → filtra apenas strings não vazias
        servicosArray = servico
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else if (typeof servico === 'string') {
        // string única → transforma em array com 1 item
        const nome = servico.trim();
        servicosArray = nome.length > 0 ? [nome] : [];
      } else {
        // tipo inválido (ex: número, objeto, etc)
        servicosArray = [];
      }

      // Não permitir chamado sem serviço
      if (!servicosArray.length) {
        return res.status(400).json({
          error: 'É obrigatório informar pelo menos um serviço válido para abrir o chamado.',
        });
      }

      // Busca serviços ativos pelo nome
      const encontrarServico = await prisma.servico.findMany({
        where: {
          nome: { in: servicosArray },
          ativo: true,
        },
        select: { id: true, nome: true },
      });

      const nomesEncontrados = encontrarServico.map((s) => s.nome);
      const nomesNaoEncontrados = servicosArray.filter(
        (n) => !nomesEncontrados.includes(n)
      );

      if (nomesNaoEncontrados.length > 0) {
        return res.status(400).json({
          error: `Os seguintes serviços não foram encontrados ou estão inativos: ${nomesNaoEncontrados.join(', ')}`,
        });
      }

      const OS = await gerarNumeroOS();

      const chamado = await prisma.chamado.create({
        data: {
          OS,
          descricao: descricao.trim(),
          usuarioId: req.usuario!.id,
          status: 'ABERTO',
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
              email: true,
            },
          },
          servicos: {
            include: {
              servico: {
                select: {
                  nome: true,
                },
              },
            },
          },
        },
      });

        const response = {
          id: chamado.id,
          OS: chamado.OS,
          descricao: chamado.descricao,
          descricaoEncerramento: chamado.descricaoEncerramento,
          status: chamado.status,
          geradoEm: chamado.geradoEm,
          encerradoEm: chamado.encerradoEm,
          tecnicoId: chamado.tecnicoId,
          usuario: chamado.usuarioId,
          servico:
            chamado.servicos.length === 1
              ? chamado.servicos[0].servico.nome
              : chamado.servicos.map((s) => s.servico.nome),
        };

      return res.status(201).json(response);
    } catch (err: any) {
      console.error('Erro ao criar chamado:', err);
      return res.status(500).json({ error: 'Erro ao criar o chamado.' });
    }
  }
);

/**
 * Atualizar status do chamado
 * - ADMIN e TECNICO podem alterar
 * - TECNICO não pode cancelar
 * - Status válidos: EM_ATENDIMENTO | ENCERRADO | CANCELADO
 * - Quando o técnico muda para EM_ATENDIMENTO, o chamado é atribuído a ele
 */
router.patch('/:id/status', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, descricaoEncerramento } = req.body as {
      status: 'EM_ATENDIMENTO' | 'ENCERRADO' | 'CANCELADO';
      descricaoEncerramento?: string;
    };

    const statusValidos = ['EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use um dos seguintes: ${statusValidos.join(', ')}` });
    }

    const chamado = await prisma.chamado.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
      },
    });

    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado.' });

    if (chamado.status === 'ENCERRADO' && req.usuario!.regra === 'TECNICO') {
      return res.status(403).json({ error: 'Chamados encerrados não podem ser alterados por técnicos.' });
    }

    if (req.usuario!.regra === 'TECNICO' && status === 'CANCELADO') {
      return res.status(403).json({ error: 'Técnicos não podem cancelar chamados.' });
    }

    const dataToUpdate: any = {
      status,
      atualizadoEm: new Date(),
    };

    if (status === 'ENCERRADO') {
      if (!descricaoEncerramento || descricaoEncerramento.trim().length === 0) {
        return res.status(400).json({ error: 'A descrição de encerramento é obrigatória ao encerrar um chamado.' });
      }
      dataToUpdate.closedIn = new Date();
      dataToUpdate.descricaoEncerramento = descricaoEncerramento.trim();
    }

    if (status === 'EM_ATENDIMENTO' && req.usuario!.regra === 'TECNICO') {
      dataToUpdate.tecnicoId = req.usuario!.id;
    }

    const chamadoAtualizado = await prisma.chamado.update({
      where: { id },
      data: dataToUpdate,
      include: {
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
      },
    });

    const response = {
      id: chamadoAtualizado.id,
      OS: chamadoAtualizado.OS,
      descricao: chamadoAtualizado.descricao,
      descricaoEncerramento: chamadoAtualizado.descricaoEncerramento,
      status: chamadoAtualizado.status,
      geradoEm: chamadoAtualizado.geradoEm,
      atualizadoEm: chamadoAtualizado.atualizadoEm,
      encerradoEm: chamadoAtualizado.encerradoEm,
      usuario: chamadoAtualizado.usuario,
      servico: chamadoAtualizado.servicos.length
        ? {
            id: chamadoAtualizado.servicos[0].servico.id,
            nome: chamadoAtualizado.servicos[0].servico.nome,
          }
        : null,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('Erro ao atualizar status do chamado:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status do chamado.' });
  }
});

/**
 * Cancelar chamado pelo usuário
 * - Apenas o USUARIO que criou ou ADMIN podem cancelar
 * - Exige justificativa no campo descricaoEncerramento
 * - Não permite cancelar chamados já encerrados ou cancelados
 */
router.patch('/:id/cancelar-chamado', authMiddleware, authorizeRoles('USUARIO', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { descricaoEncerramento } = req.body;

    if (!descricaoEncerramento) {
      return res.status(400).json({ error: 'É necessário informar a justificativa do cancelamento.' });
    }

    const chamado = await prisma.chamado.findUnique({ where: { id } });

    if (!chamado) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    // Somente o USUARIO que criou ou ADMIN pode cancelar
    if (req.usuario!.regra === 'USUARIO' && chamado.usuarioId !== req.usuario!.id) {
      return res.status(403).json({ error: 'Você não tem permissão para cancelar este chamado.' });
    }

    if (chamado.status === 'ENCERRADO') {
      return res.status(400).json({ error: 'Não é possível cancelar um chamado encerrado.' });
    }

    if (chamado.status === 'CANCELADO') {
      return res.status(400).json({ error: 'Este chamado já está cancelado.' });
    }

    const chamadoCancelado = await prisma.chamado.update({
      where: { id },
      data: {
        status: 'CANCELADO',
        descricaoEncerramento,
        encerradoEm: new Date(),
        atualizadoEm: new Date(),
      },
      include: { usuario: true, servicos: { include: { servico: true } } },
    });

    return res.status(200).json({
      message: 'Chamado cancelado com sucesso.',
      chamado: chamadoCancelado,
    });
  } catch (err: any) {
    console.error('Erro ao cancelar chamado pelo usuário:', err);
    return res.status(500).json({ error: 'Erro ao cancelar o chamado.' });
  }
});

router.delete('/:id/excluir-chamado', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Verifica se o chamado existe
    const chamado = await prisma.chamado.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: true } },
      },
    });

    if (!chamado) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    // Deleta primeiro os serviços vinculados (para evitar erro de FK)
    await prisma.ordemDeServico.deleteMany({
      where: { chamadoId: id },
    });

    await prisma.chamado.delete({
      where: { id },
    });

    return res.status(200).json({
      message: `Chamado ${chamado.OS} deletado com sucesso.`,
      chamado: {
        id: chamado.id,
        Os: chamado.OS,
        descricao: chamado.descricao,
        descricaoEncerramento: chamado.descricaoEncerramento,
        status: chamado.status,
        geradoEm: chamado.geradoEm,
        atualizadoEm: chamado.atualizadoEm,
        encerradoEm: chamado.encerradoEm,
        tecnicoId: chamado.tecnicoId,
        usuario: chamado.usuario,
        servicos: chamado.servicos.map((s) => ({
          id: s.id,
          servico: s.servico,
        })),
      },
    });
  } catch (err: any) {
    console.error('Erro ao deletar chamado:', err);
    return res.status(500).json({ error: 'Erro ao deletar o chamado.' });
  }
});

export default router;
