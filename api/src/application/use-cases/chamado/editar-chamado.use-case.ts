import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';
import { uploadArquivos } from './helpers/upload-arquivos.helper';

interface EditarChamadoInput {
  id: string;
  descricao?: string;
  arquivos: Express.Multer.File[];
  usuarioId: string;
  usuarioRegra: string;
}

export async function editarChamadoUseCase(input: EditarChamadoInput) {
  const { id, descricao, arquivos, usuarioId, usuarioRegra } = input;

  try {
    if (!descricao && arquivos.length === 0) {
      throw new ChamadoError('Informe uma nova descrição ou ao menos um arquivo para atualizar', 'EMPTY_UPDATE', 400);
    }

    const chamado = await prisma.chamado.findUnique({
      where:  { id },
      select: { id: true, OS: true, status: true, usuarioId: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    if (usuarioRegra === 'USUARIO' && chamado.usuarioId !== usuarioId) {
      throw new ChamadoError('Você só pode editar chamados criados por você', 'FORBIDDEN', 403);
    }

    const statusEditaveis: ChamadoStatus[] = [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO];
    if (!statusEditaveis.includes(chamado.status)) {
      throw new ChamadoError(`Chamado com status ${chamado.status} não pode ser editado`, 'INVALID_STATUS', 400);
    }

    let anexosData: any[] = [];
    let errosUpload: string[] = [];
    if (arquivos.length > 0) {
      const r = await uploadArquivos(arquivos, id, chamado.OS, usuarioId);
      anexosData  = r.data;
      errosUpload = r.erros;
    }

    const chamadoAtualizado = await prisma.$transaction(async (tx) => {
      const updated = await tx.chamado.update({
        where: { id },
        data:  { ...(descricao ? { descricao: descricao.trim() } : {}), atualizadoEm: new Date() },
        include: CHAMADO_INCLUDE,
      });
      if (anexosData.length > 0) await tx.anexoChamado.createMany({ data: anexosData });
      return updated;
    });

    logger.info({ chamadoId: id, usuarioId }, '[CHAMADO] Chamado editado');

    return {
      message: 'Chamado atualizado com sucesso',
      chamado: formatarChamadoResposta(chamadoAtualizado),
      anexos:  { adicionados: anexosData.length, erros: errosUpload.length > 0 ? errosUpload : undefined },
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao editar');
    throw new ChamadoError('Erro ao editar o chamado', 'EDIT_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}