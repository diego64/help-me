import { prisma } from '@infrastructure/database/prisma/client';
import { minioClient } from '@infrastructure/storage/minio.client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface DownloadAnexoInput {
  chamadoId: string;
  anexoId: string;
}

export async function downloadAnexoUseCase(input: DownloadAnexoInput) {
  const { chamadoId, anexoId } = input;

  try {
    const anexo = await prisma.anexoChamado.findUnique({
      where:  { id: anexoId },
      select: {
        id: true, chamadoId: true, nomeOriginal: true,
        mimetype: true, tamanho: true, bucketMinio: true,
        objetoMinio: true, deletadoEm: true,
      },
    });

    if (!anexo || anexo.deletadoEm || anexo.chamadoId !== chamadoId) {
      throw new ChamadoError('Anexo não encontrado', 'NOT_FOUND', 404);
    }

    const url = await minioClient.presignedGetObject(
      anexo.bucketMinio,
      anexo.objetoMinio,
      10 * 60
    );

    logger.info({ chamadoId, anexoId }, '[CHAMADO] URL de download gerada');

    return {
      url,
      expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      arquivo: {
        id:           anexo.id,
        nomeOriginal: anexo.nomeOriginal,
        mimetype:     anexo.mimetype,
        tamanho:      anexo.tamanho,
      },
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId, anexoId }, '[CHAMADO] Erro ao gerar URL de download');
    throw new ChamadoError('Erro ao gerar URL de download', 'ANEXO_DOWNLOAD_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}