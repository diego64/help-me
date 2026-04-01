import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';
import { uploadArquivos } from './helpers/upload-arquivos.helper';

interface UploadAnexosInput {
  chamadoId: string;
  arquivos: Express.Multer.File[];
  autorId: string;
}

export async function uploadAnexosUseCase(input: UploadAnexosInput) {
  const { chamadoId, arquivos, autorId } = input;

  try {
    if (!arquivos.length) {
      throw new ChamadoError('Nenhum arquivo enviado', 'NO_FILES', 400);
    }

    const chamado = await prisma.chamado.findUnique({
      where:  { id: chamadoId },
      select: { id: true, OS: true, status: true, deletadoEm: true },
    });

    if (!chamado || chamado.deletadoEm) {
      throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    }

    if (chamado.status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Não é possível anexar arquivos em chamados cancelados', 'INVALID_STATUS', 400);
    }

    if (chamado.status === ChamadoStatus.ENCERRADO) {
      throw new ChamadoError('Não é possível anexar arquivos em chamados encerrados', 'INVALID_STATUS', 400);
    }

    const { data: anexosData, erros } = await uploadArquivos(arquivos, chamadoId, chamado.OS, autorId);

    if (anexosData.length > 0) {
      await prisma.anexoChamado.createMany({ data: anexosData });
    }

    logger.info({ chamadoId, enviados: anexosData.length, autorId }, '[CHAMADO] Anexos enviados');

    return {
      message:  `${anexosData.length} arquivo(s) anexado(s) com sucesso`,
      enviados: anexosData.length,
      erros:    erros.length > 0 ? erros : undefined,
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId }, '[CHAMADO] Erro ao fazer upload de anexos');
    throw new ChamadoError('Erro ao fazer upload dos arquivos', 'UPLOAD_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}