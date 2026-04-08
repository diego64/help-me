import { CategoriaReembolso } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';
import { gerarNumeroReembolso } from './helpers/numero.helper';
import { uploadComprovantes } from './helpers/upload-comprovantes.helper';

interface CriarReembolsoInput {
  descricao: string;
  categoria: CategoriaReembolso;
  valor: number;
  arquivos: Express.Multer.File[];
  solicitanteId: string;
}

export async function criarReembolsoUseCase(input: CriarReembolsoInput) {
  const { descricao, categoria, valor, arquivos, solicitanteId } = input;

  try {
    if (valor <= 0) {
      throw new ReembolsoError('O valor do reembolso deve ser maior que zero', 'VALOR_INVALIDO', 400);
    }

    const [solicitante, numero] = await Promise.all([
      prisma.usuario.findUnique({
        where:  { id: solicitanteId },
        select: { id: true, setor: true },
      }),
      gerarNumeroReembolso(),
    ]);

    if (!solicitante) {
      throw new ReembolsoError('Solicitante não encontrado', 'SOLICITANTE_NOT_FOUND', 404);
    }

    let comprovantesData: any[] = [];
    let errosUpload: string[]   = [];
    if (arquivos.length > 0) {
      const r = await uploadComprovantes(arquivos, numero, solicitanteId);
      comprovantesData = r.data;
      errosUpload      = r.erros;
    }

    const reembolso = await prisma.$transaction(async (tx) => {
      const novo = await tx.reembolso.create({
        data: {
          numero,
          descricao: descricao.trim(),
          categoria,
          valor,
          setor:        solicitante.setor ?? undefined,
          solicitanteId,
        },
        include: REEMBOLSO_INCLUDE,
      });

      if (comprovantesData.length > 0) {
        await tx.anexoReembolso.createMany({
          data: comprovantesData.map(c => ({ ...c, reembolsoId: novo.id })),
        });
      }

      return novo;
    });

    logger.info({ reembolsoId: reembolso.id, numero, solicitanteId }, '[REEMBOLSO] Criado');

    return {
      ...formatarReembolsoResposta(reembolso),
      comprovantes: { enviados: comprovantesData.length, erros: errosUpload.length > 0 ? errosUpload : undefined },
    };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error }, '[REEMBOLSO] Erro ao criar');
    throw new ReembolsoError('Erro ao criar reembolso', 'CREATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
