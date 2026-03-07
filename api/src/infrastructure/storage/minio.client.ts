import { Client } from 'minio';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER || 'minio_admin';
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD || '';

export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'helpme-anexos';

export const minioClient = new Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ROOT_USER,
  secretKey: MINIO_ROOT_PASSWORD,
});

export async function garantirBucket(bucket: string): Promise<void> {
  const existe = await minioClient.bucketExists(bucket);
  if (!existe) {
    await minioClient.makeBucket(bucket, 'us-east-1');
    console.log(`[MINIO] Bucket criado: ${bucket}`);
  }
}