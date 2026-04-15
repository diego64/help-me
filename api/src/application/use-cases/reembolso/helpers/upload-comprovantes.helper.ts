import { v4 as uuidv4 } from 'uuid';
import { minioClient, MINIO_BUCKET, garantirBucket } from '@infrastructure/storage/minio.client';

export const MIMETYPES_REEMBOLSO: Record<string, string> = {
  'image/jpeg':       'jpg',
  'image/png':        'png',
  'image/webp':       'webp',
  'application/pdf':  'pdf',
};

export async function uploadComprovantes(
  files: Express.Multer.File[],
  numero: string,
  autorId: string
): Promise<{ data: any[]; erros: string[] }> {
  await garantirBucket(MINIO_BUCKET);

  const resultados = await Promise.allSettled(
    files.map(async (file) => {
      const extensao    = MIMETYPES_REEMBOLSO[file.mimetype];
      const nomeArquivo = `reembolsos/${numero}/${uuidv4()}.${extensao}`;
      await minioClient.putObject(MINIO_BUCKET, nomeArquivo, file.buffer, file.size, { 'Content-Type': file.mimetype });
      return {
        autorId,
        nomeArquivo,
        nomeOriginal: file.originalname,
        mimetype:     file.mimetype,
        tamanho:      file.size,
        bucketMinio:  MINIO_BUCKET,
        objetoMinio:  nomeArquivo,
      };
    })
  );

  const data: any[]     = [];
  const erros: string[] = [];
  resultados.forEach((r, idx) => {
    if (r.status === 'fulfilled') data.push(r.value);
    else erros.push(`Erro ao enviar ${files[idx].originalname}: ${(r as any).reason?.message}`);
  });

  return { data, erros };
}
