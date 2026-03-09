import pkg from 'pino-abstract-transport';
const { build } = pkg;
import { fetch } from 'undici';

export default async function lokiTransport(opts) {
  const host = opts.host ?? 'http://localhost:3100';
  const labels = opts.labels ?? {};
  const interval = (opts.interval ?? 5) * 1000;
  const buffer = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    const values = buffer.splice(0, buffer.length);
    try {
      await fetch(`${host}/loki/api/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streams: [{ stream: labels, values }],
        }),
      });
    } catch (err) {
      console.error('[LOKI] Erro ao enviar logs:', err.message);
    }
  };

  const timer = setInterval(flush, interval);

  return build(async function (source) {
    for await (const obj of source) {
      const ts = obj.time
        ? String(new Date(obj.time).getTime() * 1_000_000)
        : String(Date.now() * 1_000_000);
      buffer.push([ts, JSON.stringify(obj)]);
    }
  }, {
    async close() {
      clearInterval(timer);
      await flush();
    },
  });
}