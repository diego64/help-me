import { ChamadoStatus, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { calcularEPersistirSLA } from '../../../domain/sla/sla.service';
import { publicarChamadoAberto } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';
import { uploadArquivos } from './helpers/upload-arquivos.helper';
import { gerarNumeroOS } from './helpers/os.helper';

const NIVEL_POR_PRIORIDADE = {
  P1: ['N3'], P2: ['N2', 'N3'], P3: ['N2', 'N3'], P4: ['N1', 'N3'], P5: ['N1', 'N3'],
} as const;

interface AbrirChamadoInput {
  descricao: string;
  servico: any;
  arquivos: Express.Multer.File[];
  usuarioId: string;
  usuarioNome: string;
}

function normalizarServicos(servico: any): string[] {
  if (servico == null) return [];
  if (Array.isArray(servico)) return servico.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(s => s.length > 0);
  if (typeof servico === 'string') { const n = servico.trim(); return n.length > 0 ? [n] : []; }
  return [];
}

export async function abrirChamadoUseCase(input: AbrirChamadoInput) {
  const { descricao, servico, arquivos, usuarioId, usuarioNome } = input;

  try {
    const servicosArray = normalizarServicos(servico);
    if (!servicosArray.length) {
      throw new ChamadoError('É obrigatório informar pelo menos um serviço válido', 'SERVICO_REQUIRED', 400);
    }

    const [encontrarServico, OS] = await Promise.all([
      prisma.servico.findMany({ where: { nome: { in: servicosArray }, ativo: true, deletadoEm: null }, select: { id: true, nome: true } }),
      gerarNumeroOS(),
    ]);

    const nomesNaoEncontrados = servicosArray.filter(n => !encontrarServico.map(s => s.nome).includes(n));
    if (nomesNaoEncontrados.length > 0) {
      throw new ChamadoError(`Serviços não encontrados ou inativos: ${nomesNaoEncontrados.join(', ')}`, 'SERVICO_NOT_FOUND', 400);
    }

    let anexosData: any[] = [];
    let errosUpload: string[] = [];
    if (arquivos.length > 0) {
      const r = await uploadArquivos(arquivos, '', OS, usuarioId);
      anexosData  = r.data;
      errosUpload = r.erros;
    }

    const chamado = await prisma.$transaction(async (tx) => {
      const novo = await tx.chamado.create({
        data: {
          OS,
          descricao:  descricao.trim(),
          usuarioId,
          status:     ChamadoStatus.ABERTO,
          prioridade: PrioridadeChamado.P4,
          servicos:   { create: encontrarServico.map(s => ({ servico: { connect: { id: s.id } } })) },
        },
        include: CHAMADO_INCLUDE,
      });
      if (anexosData.length > 0) {
        await tx.anexoChamado.createMany({ data: anexosData.map(a => ({ ...a, chamadoId: novo.id })) });
      }
      return novo;
    });

    salvarHistoricoChamado({
      chamadoId:  chamado.id,
      tipo:       'ABERTURA',
      de:         undefined,
      para:       ChamadoStatus.ABERTO,
      descricao:  chamado.descricao,
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: (chamado.usuario as any)?.email ?? '',
    }).catch((err: unknown) => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    calcularEPersistirSLA(chamado.id, PrioridadeChamado.P4, chamado.geradoEm)
      .catch((err: unknown) => logger.error({ err }, '[CHAMADO] Erro ao calcular SLA'));

    prisma.usuario.findMany({
      where:  { regra: 'TECNICO', nivel: { in: NIVEL_POR_PRIORIDADE[PrioridadeChamado.P4] as any }, ativo: true, deletadoEm: null },
      select: { id: true, email: true, nome: true, nivel: true },
    }).then(tecnicos =>
      publicarChamadoAberto({
        chamadoId:    chamado.id,
        chamadoOS:    chamado.OS,
        prioridade:   PrioridadeChamado.P4,
        descricao:    chamado.descricao,
        usuarioNome,
        usuarioSetor: (chamado.usuario as any)?.setor ?? '',
        servicos:     encontrarServico.map(s => s.nome),
        tecnicos:     tecnicos.map(t => ({ id: t.id, email: t.email, nome: t.nome, nivel: t.nivel! })),
      })
    ).catch((err: unknown) => logger.error({ err }, '[CHAMADO] Erro ao publicar Kafka'));

    logger.info({ chamadoId: chamado.id, OS: chamado.OS, usuarioId }, '[CHAMADO] Chamado aberto');

    return {
      ...formatarChamadoResposta(chamado),
      anexos: { enviados: anexosData.length, erros: errosUpload.length > 0 ? errosUpload : undefined },
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error }, '[CHAMADO] Erro ao abrir chamado');
    throw new ChamadoError('Erro ao criar o chamado', 'CREATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}