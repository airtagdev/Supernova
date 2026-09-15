import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import serveStatic from '@fastify/static';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
logging.set_level(logging.NONE);
wisp.options.allow_udp_streams = false;
const app = Fastify({ serverFactory: handler => createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  handler(req, res);
}).on('upgrade', (req, socket, head) => {
  if (req.url !== '/wisp/') return socket.destroy();
  const origin = req.headers.origin;
  try { if (!origin || new URL(origin).host !== req.headers.host) return socket.destroy(); }
  catch { return socket.destroy(); }
  wisp.routeRequest(req, socket, head);
}) });
await app.register(serveStatic, { root: fileURLToPath(new URL('./public/', import.meta.url)), maxAge: 0 });
for (const [prefix, root] of [['/scram/', scramjetPath], ['/libcurl/', libcurlPath], ['/baremux/', baremuxPath]]) {
  await app.register(serveStatic, { root, prefix, decorateReply: false, maxAge: '1h' });
}
app.get('/health', async () => ({ status: 'ok' }));
app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: 'Not found' }));
const port = Number(process.env.PORT || 8080);
await app.listen({ host: '0.0.0.0', port });
console.log(`Supernova listening on port ${port}`);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  const timeout = setTimeout(() => process.exit(0), 5000).unref();
  await app.close(); clearTimeout(timeout); process.exit(0);
});
