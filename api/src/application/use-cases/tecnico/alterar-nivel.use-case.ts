import { Regra, NivelTecnico } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';
import { TECNICO_SELECT_NIVEL } from './selects';

const NIVEIS_VALIDOS: NivelTecnico[] = ['N1', 'N2', 'N3'];

interface AlterarNivelInput {
  id: string;
  nivel: string;
  solicitanteId: string;
}

export async function alterarNivelUseCase(input: AlterarNivelInput) {
  const { id, nivel, solicitanteId } = input;

  try {
    if (!NIVEIS_VALIDOS.includes(nivel as NivelTecnico)) {
      throw new TecnicoError(`Nível inválido. Use: ${NIVEIS_VALIDOS.join(', ')}`, 'INVALID_NIVEL', 400);
    }

    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true, email: true, nivel: true, deletadoEm: true },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    if (tecnico.deletadoEm) throw new TecnicoError('Não é possível alterar o nível de um técnico deletado', 'DELETED', 400);
    if (tecnico.nivel === nivel) throw new TecnicoError(`Técnico já possui o nível ${nivel}`, 'SAME_NIVEL', 400);

    const updated = await prisma.usuario.update({
      where:  { id },
      data:   { nivel: nivel as NivelTecnico },
      select: TECNICO_SELECT_NIVEL,
    });

    logger.info({ tecnicoId: id, nivelAnterior: tecnico.nivel, nivelNovo: nivel, solicitanteId }, '[TECNICO] Nível alterado');

    return { message: `Nível do técnico atualizado para ${nivel} com sucesso`, tecnico: updated };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao alterar nível');
    throw new TecnicoError('Erro ao alterar nível do técnico', 'NIVEL_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}