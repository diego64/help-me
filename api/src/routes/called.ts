import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Função auxiliar para gerar número de OS
async function gerarNumeroOSAtomic(): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const ultimoChamado = await tx.chamado.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { osNumber: true },
    });

    let novoNumero = 1;

    if (ultimoChamado?.osNumber) {
      const numeroAnterior = parseInt(ultimoChamado.osNumber.replace('INC', ''), 10);
      novoNumero = numeroAnterior + 1;
    }

    const numeroFormatado = String(novoNumero).padStart(4, '0');
    const novoOS = `INC${numeroFormatado}`;

    const existente = await tx.chamado.findUnique({
      where: { osNumber: novoOS },
    });

    if (existente) {
      return gerarNumeroOSAtomic();
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
      const { descricao, services } = req.body;

      if (!descricao || typeof descricao !== 'string' || descricao.trim().length === 0) {
        return res.status(400).json({ error: 'A descrição do chamado é obrigatória.' });
      }

      // Normaliza o campo "services"
      const servicesArray: string[] =
        services === undefined || services === null
          ? []
          : Array.isArray(services)
          ? services.filter((s) => typeof s === 'string' && s.trim().length > 0)
          : typeof services === 'string'
          ? [services.trim()]
          : [];

      // Busca serviços ativos pelo nome
      const foundServices = await prisma.service.findMany({
        where: {
          name: { in: servicesArray },
          isActive: true,
        },
        select: { id: true, name: true },
      });

      const nomesEncontrados = foundServices.map((s) => s.name);
      const nomesNaoEncontrados = servicesArray.filter(
        (n) => !nomesEncontrados.includes(n)
      );

      if (nomesNaoEncontrados.length > 0) {
        return res.status(400).json({
          error: `Os seguintes serviços não foram encontrados ou estão inativos: ${nomesNaoEncontrados.join(', ')}`,
        });
      }

      const osNumber = await gerarNumeroOSAtomic();

      const chamado = await prisma.chamado.create({
        data: {
          osNumber,
          descricao: descricao.trim(),
          usuarioId: req.user!.id,
          status: 'ABERTO',
          services: {
            create: foundServices.map((service) => ({
              service: { connect: { id: service.id } },
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
          services: {
            include: {
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      const response = {
        id: chamado.id,
        OS: chamado.osNumber,
        descricao: chamado.descricao,
        descricaoEncerramento: chamado.descricaoEncerramento,
        status: chamado.status,
        createdAt: chamado.createdAt,
        updatedAt: chamado.updatedAt,
        closedIn: chamado.closedIn,
        tecnicoId: chamado.tecnicoId,
        usuario: chamado.usuario,
        servico: chamado.services.map((s) => ({
          service: s.service,
        })),
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
    const { status } = req.body;

    const statusValidos = ['EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO'];

    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use um dos seguintes: ${statusValidos.join(', ')}` });
    }

    // Impede técnico de cancelar chamados
    if (req.user!.role === 'TECNICO' && status === 'CANCELADO') {
      return res.status(403).json({ error: 'Técnicos não podem cancelar chamados.' });
    }

    // Busca o chamado
    const chamado = await prisma.chamado.findUnique({
      where: { id },
    });

    if (!chamado) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    // Atualiza o chamado com base no papel do usuário
    const dataToUpdate: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'ENCERRADO') {
      dataToUpdate.closedIn = new Date();
      dataToUpdate.descricaoEncerramento = chamado.descricaoEncerramento;
    }

    // Se o técnico assumir o chamado
    if (status === 'EM_ATENDIMENTO' && req.user!.role === 'TECNICO') {
      dataToUpdate.tecnicoId = req.user!.id;
    }

    const chamadoAtualizado = await prisma.chamado.update({
      where: { id },
      data: dataToUpdate,
      include: {
        usuario: { select: { id: true, firstName: true, lastName: true, email: true } },
        services: { include: { service: true } },
      },
    });

    return res.status(200).json(chamadoAtualizado);
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
    if (req.user!.role === 'USUARIO' && chamado.usuarioId !== req.user!.id) {
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
        closedIn: new Date(),
        updatedAt: new Date(),
      },
      include: { usuario: true, services: { include: { service: true } } },
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
        usuario: { select: { id: true, firstName: true, lastName: true, email: true } },
        services: { include: { service: true } },
      },
    });

    if (!chamado) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    // Deleta primeiro os serviços vinculados (para evitar erro de FK)
    await prisma.chamadoService.deleteMany({
      where: { chamadoId: id },
    });

    await prisma.chamado.delete({
      where: { id },
    });

    return res.status(200).json({
      message: `Chamado ${chamado.osNumber} deletado com sucesso.`,
      chamado: {
        id: chamado.id,
        osNumber: chamado.osNumber,
        descricao: chamado.descricao,
        descricaoEncerramento: chamado.descricaoEncerramento,
        status: chamado.status,
        createdAt: chamado.createdAt,
        updatedAt: chamado.updatedAt,
        closedIn: chamado.closedIn,
        tecnicoId: chamado.tecnicoId,
        usuario: chamado.usuario,
        services: chamado.services.map((s) => ({
          id: s.id,
          service: s.service,
        })),
      },
    });
  } catch (err: any) {
    console.error('Erro ao deletar chamado:', err);
    return res.status(500).json({ error: 'Erro ao deletar o chamado.' });
  }
});

export default router;
