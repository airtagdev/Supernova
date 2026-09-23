import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import serveStatic from '@fastify/static';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
logging.set_level(logging.NONE);
wisp.options.allow_udp_streams = false;
const require = createRequire(import.meta.url);
const emulatorDataPath = join(dirname(require.resolve('@emulatorjs/emulatorjs/package.json')), 'data');
const emulatorCorePath = dirname(require.resolve('@emulatorjs/core-snes9x/package.json'));
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

const chatClients = new Map();
const chatHistory = [];
const chatRateLimits = new Map();
const cleanChatText = (value, limit) => typeof value === 'string'
  ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit)
  : '';
const sendChatEvent = (response, event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
function broadcastChat(event) {
  for (const [id, client] of chatClients) {
    try { sendChatEvent(client.response, event); }
    catch { chatClients.delete(id); chatRateLimits.delete(id); }
  }
}
function chatPresence() { broadcastChat({ type: 'presence', count: chatClients.size }); }
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}
app.get('/api/chat/events', (request, reply) => {
  if (!sameOrigin(request)) return reply.code(403).send({ error: 'Origin not allowed.' });
  const clientId = typeof request.query?.clientId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(request.query.clientId) ? request.query.clientId : '';
  const name = cleanChatText(request.query?.name, 24);
  if (!clientId || name.length < 2) return reply.code(400).send({ error: 'Choose a name between 2 and 24 characters.' });
  const existing = chatClients.get(clientId);
  if (existing) { try { existing.response.end(); } catch {} }
  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders?.();
  chatClients.set(clientId, { name, response });
  sendChatEvent(response, { type: 'history', messages: chatHistory });
  broadcastChat({ type: 'system', text: `${name} joined the room.`, time: new Date().toISOString() });
  chatPresence();
  const heartbeat = setInterval(() => { try { response.write(': keepalive\n\n'); } catch {} }, 20000);
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    if (chatClients.get(clientId)?.response !== response) return;
    chatClients.delete(clientId); chatRateLimits.delete(clientId);
    broadcastChat({ type: 'system', text: `${name} left the room.`, time: new Date().toISOString() });
    chatPresence();
  });
});
app.post('/api/chat/messages', async (request, reply) => {
  if (!sameOrigin(request)) return reply.code(403).send({ error: 'Origin not allowed.' });
  const clientId = typeof request.body?.clientId === 'string' ? request.body.clientId : '';
  const client = chatClients.get(clientId);
  if (!client) return reply.code(409).send({ error: 'Join the room before sending a message.' });
  const text = cleanChatText(request.body?.message, 300);
  if (!text) return reply.code(400).send({ error: 'Enter a message first.' });
  const now = Date.now();
  const recent = (chatRateLimits.get(clientId) || []).filter(time => now - time < 5000);
  if (recent.length >= 8) return reply.code(429).send({ error: 'You are sending messages too quickly.' });
  recent.push(now); chatRateLimits.set(clientId, recent);
  const event = { type: 'message', id: randomUUID(), name: client.name, text, time: new Date(now).toISOString() };
  chatHistory.push(event);
  if (chatHistory.length > 60) chatHistory.shift();
  broadcastChat(event);
  return reply.code(202).send({ ok: true });
});
await app.register(serveStatic, { root: fileURLToPath(new URL('./public/', import.meta.url)), maxAge: 0 });
for (const [prefix, root] of [['/emulatorjs/cores/', emulatorCorePath], ['/emulatorjs/', emulatorDataPath], ['/scram/', scramjetPath], ['/uv/', uvPath], ['/libcurl/', libcurlPath], ['/baremux/', baremuxPath]]) {
  await app.register(serveStatic, { root, prefix, decorateReply: false, maxAge: '1h' });
}
app.get('/health', async () => ({ status: 'ok', services: { proxy: true, games: true, chat: true } }));
app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: 'Not found' }));
const port = Number(process.env.PORT || 8080);
await app.listen({ host: process.env.HOST || '0.0.0.0', port });
console.log(`Supernova listening on port ${port}`);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  const timeout = setTimeout(() => process.exit(0), 5000).unref();
  await app.close(); clearTimeout(timeout); process.exit(0);
});
