import * as Minio from 'minio';
import { logger } from '@shared/config/logger';

let minioInstance: Minio.Client | null = null;

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

let minioConfig: MinioConfig | null = null;

/**
 * INICIALIZA E RETORNA A INSTÂNCIA DO MINIO (LAZY LOADING)
 * @returns INSTÂNCIA DO MINIO CLIENT
 * @throws ERROR SE VARIÁVEIS DE AMBIENTE NÃO ESTIVEREM DEFINIDAS
 */
function getMinioInstance(): Minio.Client {
  if (minioInstance) return minioInstance;

  const endPoint = process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET || 'inventory-service';

  if (!endPoint) throw new Error('MINIO_ENDPOINT não definida!');
  if (!accessKey) throw new Error('MINIO_ACCESS_KEY não definida!');
  if (!secretKey) throw new Error('MINIO_SECRET_KEY não definida!');

  minioConfig = {
    endPoint,
    port: parseInt(port || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey,
    secretKey,
    bucket,
  };

  minioInstance = new Minio.Client({
    endPoint: minioConfig.endPoint,
    port: minioConfig.port,
    useSSL: minioConfig.useSSL,
    accessKey: minioConfig.accessKey,
    secretKey: minioConfig.secretKey,
  });

  return minioInstance;
}

/**
 * GARANTE QUE O BUCKET EXISTE, CRIA SE NÃO EXISTIR
 */
async function garantirBucket(client: Minio.Client, bucket: string): Promise<void> {
  const existe = await client.bucketExists(bucket);
  if (!existe) {
    await client.makeBucket(bucket);
    logger.info({ bucket }, 'Bucket MinIO criado');
  }
}

/**
 * INICIALIZA A CONEXÃO COM O MINIO E GARANTE O BUCKET
 */
export async function conectarMinio(): Promise<void> {
  try {
    const client = getMinioInstance();
    await garantirBucket(client, minioConfig!.bucket);
    logger.info({ endpoint: minioConfig?.endPoint, bucket: minioConfig?.bucket }, 'MinIO conectado');
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao conectar ao MinIO - uploads indisponíveis');
  }
}

/**
 * FAZ UPLOAD DE UM ARQUIVO E RETORNA A URL DE ACESSO
 * @param nomeArquivo - nome único do arquivo (ex: reembolso/uuid.pdf)
 * @param buffer - conteúdo do arquivo
 * @param mimeType - tipo do conteúdo (ex: application/pdf, image/jpeg)
 * @returns URL pública do arquivo
 */
export async function uploadArquivo(
  nomeArquivo: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const client = getMinioInstance();
  const bucket = minioConfig!.bucket;

  await client.putObject(bucket, nomeArquivo, buffer, buffer.length, {
    'Content-Type': mimeType,
  });

  logger.debug({ bucket, nomeArquivo }, 'Arquivo enviado ao MinIO');

  const publicUrl = process.env.MINIO_PUBLIC_URL;
  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, '')}/${bucket}/${nomeArquivo}`;
  }
  return `${minioConfig!.useSSL ? 'https' : 'http'}://${minioConfig!.endPoint}:${minioConfig!.port}/${bucket}/${nomeArquivo}`;
}

/**
 * REMOVE UM ARQUIVO DO BUCKET
 * @param nomeArquivo - nome do arquivo a remover
 */
export async function removerArquivo(nomeArquivo: string): Promise<void> {
  const client = getMinioInstance();
  const bucket = minioConfig!.bucket;

  await client.removeObject(bucket, nomeArquivo);
  logger.debug({ bucket, nomeArquivo }, 'Arquivo removido do MinIO');
}

/**
 * GERA URL TEMPORÁRIA DE ACESSO (PRESIGNED URL)
 * @param nomeArquivo - nome do arquivo
 * @param expiracaoSegundos - tempo de expiração em segundos (padrão: 1h)
 * @returns URL temporária de acesso
 */
export async function gerarUrlTemporaria(
  nomeArquivo: string,
  expiracaoSegundos: number = 3600,
): Promise<string> {
  const client = getMinioInstance();
  const bucket = minioConfig!.bucket;

  return client.presignedGetObject(bucket, nomeArquivo, expiracaoSegundos);
}

export { minioConfig };