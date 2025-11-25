import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';
import { salvarHistoricoChamado, listarHistoricoChamado } from '../repositories/chamadoAtualizacao.repository';
import ChamadoAtualizacaoModel from '../models/chamadoAtualizacao.model';

const router = Router();

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

// ============================================================================
// BERTURA DE CHAMADO
// ============================================================================

router.post('/abertura-chamado', authMiddleware, authorizeRoles('USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { descricao, servico } = req.body;
    if (!descricao || typeof descricao !== 'string' || descricao.trim().length === 0) {
      return res.status(400).json({ error: 'A descrição do chamado é obrigatória.' });
    }
    let servicosArray: string[] = [];
    if (servico == null) servicosArray = [];
    else if (Array.isArray(servico)) {
      servicosArray = servico
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (typeof servico === 'string') {
      const nome = servico.trim();
      servicosArray = nome.length > 0 ? [nome] : [];
    } else {
      servicosArray = [];
    }
    if (!servicosArray.length) {
      return res.status(400).json({
        error: 'É obrigatório informar pelo menos um serviço válido para abrir o chamado.',
      });
    }
    const encontrarServico = await prisma.servico.findMany({
      where: {
        nome: { in: servicosArray },
        ativo: true,
      },
      select: { id: true, nome: true },
    });
    const nomesEncontrados = encontrarServico.map((s) => s.nome);
    const nomesNaoEncontrados = servicosArray.filter((n) => !nomesEncontrados.includes(n));
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
          select: { id: true, email: true },
        },
        servicos: {
          include: { servico: { select: { nome: true } } },
        },
      },
    });

    // Opcional: Salvar histórico da abertura no MongoDB
    await salvarHistoricoChamado({
      chamadoId: chamado.id,
      tipo: "ABERTURA",
      de: undefined,
      para: "ABERTO",
      descricao: chamado.descricao,
      autorId: req.usuario!.id,
      autorNome: req.usuario!.nome,
      autorEmail: req.usuario!.email
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
});

// ============================================================================
// STATUS DO CHAMADO
// ============================================================================

router.patch('/:id/status', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, descricaoEncerramento, atualizacaoDescricao } = req.body as {
      status: 'EM_ATENDIMENTO' | 'ENCERRADO' | 'CANCELADO';
      descricaoEncerramento?: string;
      atualizacaoDescricao?: string;
    };

    const statusValidos = ['EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use um dos seguintes: ${statusValidos.join(', ')}` });
    }

    const chamado = await prisma.chamado.findUnique({
      where: { id },
      include: {
        tecnico: { select: { nome: true, email: true } },
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
      },
    });

    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado.' });

    if (chamado.status === 'CANCELADO') {
      return res.status(400).json({ error: 'Chamados cancelados não podem ser reabertos ou alterados.' });
    }

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
      dataToUpdate.encerradoEm = new Date();
      dataToUpdate.descricaoEncerramento = descricaoEncerramento.trim();
    }

    if (status === 'EM_ATENDIMENTO' && req.usuario!.regra === 'TECNICO') {
      const expedientes = await prisma.expediente.findMany({
        where: { usuarioId: req.usuario!.id }
      });

      if (!expedientes.length) {
        return res.status(403).json({ error: 'Sem horário de expediente cadastrado.' });
      }

      const agora = new Date();
      const horaAtual = agora.getHours() + agora.getMinutes() / 60;

      const dentroDeHorario = expedientes.some(exp => {
        const [entradaHora, entradaMin] = exp.entrada.split(':').map(Number);
        const [saidaHora, saidaMin] = exp.saida.split(':').map(Number);
        const horarioEntrada = entradaHora + entradaMin / 60;
        const horarioSaida = saidaHora + saidaMin / 60;
        return horaAtual >= horarioEntrada && horaAtual <= horarioSaida;
      });

      if (!dentroDeHorario) {
        return res.status(403).json({ error: 'Chamado só pode ser assumido dentro do seu horário de trabalho.' });
      }

      dataToUpdate.tecnicoId = req.usuario!.id;
    }

    const chamadoAtualizado = await prisma.chamado.update({
      where: { id },
      data: dataToUpdate,
      include: {
        tecnico: { select: { nome: true, email: true } },
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } },
      },
    });

    // Salva histórico no MongoDB
    await salvarHistoricoChamado({
      chamadoId: chamadoAtualizado.id,
      tipo: "STATUS",
      de: chamado.status,
      para: status,
      descricao: atualizacaoDescricao && atualizacaoDescricao.trim().length > 0
        ? atualizacaoDescricao.trim()
        : (
            status === "EM_ATENDIMENTO"
              ? "Chamado assumido pelo técnico"
              : status === "ENCERRADO"
              ? "Chamado encerrado"
              : status === "CANCELADO"
              ? "Chamado cancelado"
              : "Alteração de status"
          ),
      autorId: req.usuario!.id,
      autorNome: req.usuario!.nome,
      autorEmail: req.usuario!.email
    });

    // Buscar o histórico mais recente (Mongo)
    const historicoArr = await listarHistoricoChamado(chamadoAtualizado.id);
    const historicoMaisRecente = historicoArr.length > 0 ? historicoArr[historicoArr.length - 1] : null;

    const response = {
      id: chamadoAtualizado.id,
      OS: chamadoAtualizado.OS,
      descricao: chamadoAtualizado.descricao,
      status: chamadoAtualizado.status, // vai ser "REABERTO" se mudou!
      geradoEm: chamadoAtualizado.geradoEm,
      atualizadoEm: chamadoAtualizado.atualizadoEm,
      encerradoEm: chamadoAtualizado.encerradoEm,
      usuario: chamadoAtualizado.usuario
        ? {
            nome: chamadoAtualizado.usuario.nome,
            email: chamadoAtualizado.usuario.email
          }
        : null,
      tecnico: chamadoAtualizado.tecnico
        ? {
            nome: chamadoAtualizado.tecnico.nome,
            email: chamadoAtualizado.tecnico.email
          }
        : null,
      ultimaAtualizacao: historicoMaisRecente
        ? {
            id: historicoMaisRecente._id,
            dataHora: historicoMaisRecente.dataHora,
            tipo: historicoMaisRecente.tipo,
            de: historicoMaisRecente.de,
            para: historicoMaisRecente.para,
            descricao: historicoMaisRecente.descricao,
            autor: {
              id: historicoMaisRecente.autorId,
              email: historicoMaisRecente.autorEmail
            }
          }
        : null
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('Erro ao atualizar status do chamado:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status do chamado.' });
  }
});

// ============================================================================
// HISTÓRRICO DO CHAMADO
// ============================================================================

router.get('/:id/historico', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const historico = await listarHistoricoChamado(id);
    return res.status(200).json(historico);
  } catch (err: any) {
    console.error('Erro ao buscar histórico do chamado:', err);
    return res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
});

// ============================================================================
// REABERTURA DO CHAMADO
// ============================================================================

router.patch('/:id/reabrir-chamado', authMiddleware, authorizeRoles('USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { atualizacaoDescricao } = req.body as { atualizacaoDescricao?: string };

    const chamado = await prisma.chamado.findUnique({ where: { id } });

    if (!chamado)
      return res.status(404).json({ error: 'Chamado não encontrado.' });

    if (chamado.usuarioId !== req.usuario!.id)
      return res.status(403).json({ error: 'Você só pode reabrir chamados criados por você.' });

    if (chamado.status !== 'ENCERRADO')
      return res.status(400).json({ error: 'Somente chamados encerrados podem ser reabertos.' });

    if (!chamado.encerradoEm)
      return res.status(400).json({ error: 'Data de encerramento não localizada.' });

    // Calcula se está dentro das 48 horas
    const encerradoEm = new Date(chamado.encerradoEm);
    const agora = new Date();
    const diffHoras = (agora.getTime() - encerradoEm.getTime()) / (1000 * 60 * 60);
    if (diffHoras > 48)
      return res.status(400).json({ error: 'Só é possível reabrir até 48 horas após o encerramento.' });

    // Descobre o último técnico ativo antes do encerramento, caso tecnicoId esteja nulo
    let tecnicoId = chamado.tecnicoId;
    if (!tecnicoId) {
      // Busca última atualização histórica EM_ATENDIMENTO no MongoDB
      const historicoTecnico = await ChamadoAtualizacaoModel.findOne(
        {
          chamadoId: chamado.id,
          tipo: 'STATUS',
          para: 'EM_ATENDIMENTO'
        },
        null,
        { sort: { dataHora: -1 } }
      );
      if (historicoTecnico) {
        tecnicoId = historicoTecnico.autorId;
      }
    }

    // Atualiza chamado
    const chamadoAtualizado = await prisma.chamado.update({
      where: { id },
      data: {
        status: 'REABERTO',
        atualizadoEm: new Date(),
        encerradoEm: null,
        descricaoEncerramento: null,
        tecnicoId: tecnicoId || null
      },
      include: {
        tecnico: { select: { nome: true, email: true } },
        usuario: { select: { id: true, nome: true, sobrenome: true, email: true } },
        servicos: { include: { servico: { select: { id: true, nome: true } } } }
      }
    });

    // Salva histórico da reabertura no MongoDB
    await ChamadoAtualizacaoModel.create({
      chamadoId: chamadoAtualizado.id,
      dataHora: new Date(),
      tipo: "REABERTURA",
      de: "ENCERRADO",
      para: "REABERTO",
      descricao: atualizacaoDescricao && atualizacaoDescricao.trim().length > 0
        ? atualizacaoDescricao.trim()
        : "Chamado reaberto pelo usuário dentro do prazo",
      autorId: req.usuario!.id,
      autorNome: req.usuario!.nome,
      autorEmail: req.usuario!.email
    });

    // Busca último histórico no MongoDB
    const historicoMaisRecente = await ChamadoAtualizacaoModel.findOne(
      { chamadoId: chamadoAtualizado.id },
      null,
      { sort: { dataHora: -1 } }
    );

    const response = {
      id: chamadoAtualizado.id,
      OS: chamadoAtualizado.OS,
      descricao: chamadoAtualizado.descricao,
      status: chamadoAtualizado.status,
      geradoEm: chamadoAtualizado.geradoEm,
      atualizadoEm: chamadoAtualizado.atualizadoEm,
      encerradoEm: chamadoAtualizado.encerradoEm,
      usuario: chamadoAtualizado.usuario,
      tecnico: chamadoAtualizado.tecnico,
      servico: chamadoAtualizado.servicos.length
        ? {
            id: chamadoAtualizado.servicos[0].servico.id,
            nome: chamadoAtualizado.servicos[0].servico.nome
          }
        : null,
      ultimaAtualizacao: historicoMaisRecente
        ? {
            id: historicoMaisRecente._id,
            dataHora: historicoMaisRecente.dataHora,
            tipo: historicoMaisRecente.tipo,
            de: historicoMaisRecente.de,
            para: historicoMaisRecente.para,
            descricao: historicoMaisRecente.descricao,
            autor: {
              id: historicoMaisRecente.autorId,
              nome: historicoMaisRecente.autorNome,
              email: historicoMaisRecente.autorEmail
            }
          }
        : null
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('Erro ao reabrir chamado:', err);
    return res.status(500).json({ error: 'Erro ao reabrir chamado.' });
  }
});

// ============================================================================
// CANCELAR O CHAMADO
// ============================================================================

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

// ============================================================================
// EXCLUIR O CHAMADO
// ============================================================================

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
