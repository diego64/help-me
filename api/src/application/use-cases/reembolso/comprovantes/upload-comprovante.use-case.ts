import { ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from '../errors';
import { uploadComprovantes } from '../helpers/upload-comprovantes.helper';

interface UploadComprovanteInput {
  reembolsoId: string;
  arquivos: Express.Multer.File[];
  autorId: string;
  autorRegra: string;
}

export async function uploadComprovanteUseCase(input: UploadComprovanteInput) {
  const { reembolsoId, arquivos, autorId, autorRegra } = input;

  try {
    const reembolso = await prisma.reembolso.findUnique({
      where:  { id: reembolsoId, deletadoEm: null },
      select: { id: true, numero: true, status: true, solicitanteId: true },
    });

    if (!reembolso) {
      throw new ReembolsoError('Reembolso não encontrado', 'NOT_FOUND', 404);
    }

    if (autorRegra !== 'ADMIN' && reembolso.solicitanteId !== autorId) {
      throw new ReembolsoError('Acesso negado', 'FORBIDDEN', 403);
    }

    const statusBloqueados = [ReembolsoStatus.PAGO, ReembolsoStatus.CANCELADO, ReembolsoStatus.REJEITADO];
    if (statusBloqueados.includes(reembolso.status)) {
      throw new ReembolsoError(
        'Não é possível adicionar comprovantes a um reembolso neste status',
        'STATUS_INVALIDO',
        400
      );
    }

    if (arquivos.length === 0) {
      throw new ReembolsoError('Nenhum arquivo enviado', 'NO_FILES', 400);
    }

    const { data, erros } = await uploadComprovantes(arquivos, reembolso.numero, autorId);

    if (data.length > 0) {
      await prisma.anexoReembolso.createMany({
        data: data.map(c => ({ ...c, reembolsoId })),
      });
    }

    logger.info({ reembolsoId, enviados: data.length, autorId }, '[REEMBOLSO] Comprovantes enviados');

    return { enviados: data.length, erros: erros.length > 0 ? erros : undefined };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error, reembolsoId }, '[REEMBOLSO] Erro ao enviar comprovantes');
    throw new ReembolsoError('Erro ao enviar comprovantes', 'UPLOAD_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
