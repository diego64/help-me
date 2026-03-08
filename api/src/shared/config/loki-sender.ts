const LOKI_URL = process.env.LOKI_URL ?? 'http://localhost:3100';
const buffer: [string, string][] = [];
let timer: NodeJS.Timeout | null = null;

const flush = async () => {
  if (buffer.length === 0) return;
  const values = buffer.splice(0, buffer.length);
  try {
    await fetch(`${LOKI_URL}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streams: [{
          stream: { job: 'helpme-api', container: 'helpme-api' },
          values,
        }],
      }),
    });
  } catch {
    // silencioso para não quebrar a aplicação
  }
};

export const sendToLoki = (obj: Record<string, unknown>) => {
  const ts = obj.time
    ? String(new Date(obj.time as string).getTime() * 1_000_000)
    : String(Date.now() * 1_000_000);
  buffer.push([ts, JSON.stringify(obj)]);

  if (!timer) {
    timer = setInterval(flush, 5000);
    timer.unref();
  }
};