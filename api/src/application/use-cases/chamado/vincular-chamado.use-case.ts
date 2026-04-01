import { ChamadoStatus, NivelTecnico } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

interface VincularChamadoInput {
  paiId: string;
  filhoId: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRegra: string;
}

export async function vincularChamadoUseCase(input: VincularChamadoInput) {
  const { paiId, filhoId, usuarioId, usuarioNome, usuarioEmail, usuarioRegra } = input;

  try {
    if (usuarioRegra === 'TECNICO') {
      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      if (!tecnico || tecnico.nivel === NivelTecnico.N1) {
        throw new ChamadoError('Somente técnicos N2 ou N3 podem vincular chamados', 'FORBIDDEN', 403);
      }
    }

    if (paiId === filhoId) throw new ChamadoError('Um chamado não pode ser vinculado a si mesmo', 'SELF_LINK', 400);

    const [pai, filho] = await Promise.all([
      prisma.chamado.findUnique({ where: { id: paiId },   select: { id: true, OS: true, chamadoPaiId: true, deletadoEm: true, status: true } }),
      prisma.chamado.findUnique({ where: { id: filhoId }, select: { id: true, OS: true, chamadoPaiId: true, deletadoEm: true, status: true } }),
    ]);

    if (!pai   || pai.deletadoEm)   throw new ChamadoError('Chamado pai não encontrado',   'NOT_FOUND', 404);
    if (!filho || filho.deletadoEm) throw new ChamadoError('Chamado filho não encontrado', 'NOT_FOUND', 404);

    let cursor: string | null | undefined = pai.chamadoPaiId;
    while (cursor) {
      if (cursor === filhoId) throw new ChamadoError('Vínculo inválido: criaria um ciclo na hierarquia', 'CYCLE', 400);
      const ancestral: { chamadoPaiId: string | null } | null = await prisma.chamado.findUnique({
        where:  { id: cursor },
        select: { chamadoPaiId: true },
      });
      cursor = ancestral?.chamadoPaiId;
    }

    if (filho.chamadoPaiId === paiId) throw new ChamadoError(`Chamado ${filho.OS} já é filho de ${pai.OS}`, 'ALREADY_LINKED', 400);

    const agora               = new Date();
    const descricaoEncerramento = `Chamado vinculado ao chamado ${pai.OS}`;

    const filhoAtualizado = await prisma.$transaction(async (tx) =>
      tx.chamado.update({
        where: { id: filhoId },
        data:  { chamadoPaiId: paiId, vinculadoEm: agora, vinculadoPor: usuarioId, status: ChamadoStatus.ENCERRADO, descricaoEncerramento, encerradoEm: agora, atualizadoEm: agora },
        include: CHAMADO_INCLUDE,
      })
    );

    salvarHistoricoChamado({
      chamadoId:  filhoId,
      tipo:       'STATUS',
      de:         filho.status,
      para:       ChamadoStatus.ENCERRADO,
      descricao:  descricaoEncerramento,
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch((err: unknown) => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    logger.info({ paiId, paiOS: pai.OS, filhoId, filhoOS: filho.OS, usuarioId }, '[CHAMADO] Chamado vinculado');

    return {
      message: `Chamado ${filho.OS} vinculado ao chamado ${pai.OS} e encerrado automaticamente`,
      pai:    { id: pai.id, OS: pai.OS },
      filho:  formatarChamadoResposta(filhoAtualizado),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, paiId, filhoId }, '[CHAMADO] Erro ao vincular');
    throw new ChamadoError('Erro ao vincular chamado', 'LINK_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}