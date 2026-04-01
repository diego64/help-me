import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import ChamadoAtualizacaoModel from '@infrastructure/database/mongodb/atualizacao.chamado.model';
import { publicarChamadoReaberto } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

const REABERTURA_PRAZO_HORAS = 48;

async function buscarUltimoTecnico(chamadoId: string): Promise<string | null> {
  try {
    const h = await ChamadoAtualizacaoModel.findOne(
      { chamadoId, tipo: 'STATUS', para: 'EM_ATENDIMENTO' },
      { autorId: 1 },
      { sort: { dataHora: -1 } }
    );
    return h?.autorId || null;
  } catch { return null; }
}

interface ReabrirChamadoInput {
  id: string;
  atualizacaoDescricao?: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
}

export async function reabrirChamadoUseCase(input: ReabrirChamadoInput) {
  const { id, atualizacaoDescricao, usuarioId, usuarioNome, usuarioEmail } = input;

  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id },
      select: {
        id: true, OS: true, descricao: true, status: true, prioridade: true,
        usuarioId: true, tecnicoId: true, encerradoEm: true,
        usuario: { select: { nome: true, sobrenome: true } },
        tecnico: { select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } },
      },
    });

    if (!chamado) throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    if (chamado.usuarioId !== usuarioId) throw new ChamadoError('Você só pode reabrir chamados criados por você', 'FORBIDDEN', 403);
    if (chamado.status !== ChamadoStatus.ENCERRADO) throw new ChamadoError('Somente chamados encerrados podem ser reabertos', 'INVALID_STATUS', 400);
    if (!chamado.encerradoEm) throw new ChamadoError('Data de encerramento não encontrada', 'INVALID_STATUS', 400);

    const diffHoras = (new Date().getTime() - new Date(chamado.encerradoEm).getTime()) / (1000 * 60 * 60);
    if (diffHoras > REABERTURA_PRAZO_HORAS) {
      throw new ChamadoError(`Só é possível reabrir até ${REABERTURA_PRAZO_HORAS} horas após o encerramento`, 'DEADLINE_EXCEEDED', 400);
    }

    let tecnicoId = chamado.tecnicoId;
    if (!tecnicoId) tecnicoId = await buscarUltimoTecnico(chamado.id);

    const chamadoAtualizado = await prisma.$transaction(async (tx) =>
      tx.chamado.update({
        where: { id },
        data:  { status: ChamadoStatus.REABERTO, atualizadoEm: new Date(), encerradoEm: null, descricaoEncerramento: null, tecnicoId: tecnicoId || null },
        include: CHAMADO_INCLUDE,
      })
    );

    ChamadoAtualizacaoModel.create({
      chamadoId:  chamadoAtualizado.id,
      dataHora:   new Date(),
      tipo:       'REABERTURA',
      de:         ChamadoStatus.ENCERRADO,
      para:       ChamadoStatus.REABERTO,
      descricao:  atualizacaoDescricao?.trim() || 'Chamado reaberto pelo usuário dentro do prazo',
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    const tecnicoParaNotificar = chamado.tecnico ?? (
      tecnicoId
        ? await prisma.usuario.findUnique({ where: { id: tecnicoId }, select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } }).catch(() => null)
        : null
    );

    if (tecnicoParaNotificar) {
      publicarChamadoReaberto({
        chamadoId:   chamado.id,
        chamadoOS:   chamado.OS,
        prioridade:  chamado.prioridade,
        descricao:   chamado.descricao,
        usuarioNome: chamado.usuario ? `${chamado.usuario.nome} ${chamado.usuario.sobrenome}` : usuarioNome,
        tecnico:     { id: tecnicoParaNotificar.id, email: tecnicoParaNotificar.email, nome: `${tecnicoParaNotificar.nome} ${(tecnicoParaNotificar as any).sobrenome ?? ''}`.trim(), nivel: tecnicoParaNotificar.nivel },
      }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao publicar Kafka'));
    }

    logger.info({ chamadoId: id, usuarioId }, '[CHAMADO] Chamado reaberto');

    return formatarChamadoResposta(chamadoAtualizado);
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao reabrir');
    throw new ChamadoError('Erro ao reabrir chamado', 'REOPEN_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}