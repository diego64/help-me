import { v4 as uuidv4 } from 'uuid';
import { minioClient, MINIO_BUCKET, garantirBucket } from '@infrastructure/storage/minio.client';

const MIMETYPES_PERMITIDOS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'text/csv': 'csv',
};

export { MIMETYPES_PERMITIDOS };

export async function uploadArquivos(
  files: Express.Multer.File[],
  chamadoId: string,
  OS: string,
  autorId: string
): Promise<{ data: any[]; erros: string[] }> {
  await garantirBucket(MINIO_BUCKET);

  const resultados = await Promise.allSettled(
    files.map(async (file) => {
      const extensao    = MIMETYPES_PERMITIDOS[file.mimetype];
      const nomeArquivo = `${OS}/${uuidv4()}.${extensao}`;
      await minioClient.putObject(MINIO_BUCKET, nomeArquivo, file.buffer, file.size, { 'Content-Type': file.mimetype });
      return { chamadoId, autorId, nomeArquivo, nomeOriginal: file.originalname, mimetype: file.mimetype, tamanho: file.size, bucketMinio: MINIO_BUCKET, objetoMinio: nomeArquivo };
    })
  );

  const data: any[]    = [];
  const erros: string[] = [];
  resultados.forEach((r, idx) => {
    if (r.status === 'fulfilled') data.push(r.value);
    else erros.push(`Erro ao enviar ${files[idx].originalname}: ${(r as any).reason?.message}`);
  });

  return { data, erros };
}