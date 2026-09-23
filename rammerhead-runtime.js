import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RammerheadJSMemCache,
  RammerheadLogging,
  RammerheadProxy,
  RammerheadSessionMemoryStore,
  generateId
} = require('rammerhead');

const sessionPath = /^\/[a-f0-9]{32}(?:\/|$)/i;
const servicePaths = new Set([
  '/hammerhead.js',
  '/iframe-task.js',
  '/messaging',
  '/rammerhead.js',
  '/syncLocalStorage',
  '/task.js',
  '/transport-worker.js',
  '/worker-hammerhead.js'
]);

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : String(value || '').split(',')[0].trim();
}

export function isRammerheadRequest(url = '') {
  let pathname;
  try { pathname = new URL(url, 'http://supernova.local').pathname; }
  catch { return false; }
  return sessionPath.test(pathname) || servicePaths.has(pathname) || pathname === '/api/shuffleDict';
}

export function rammerheadUrl(id, destination) {
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new TypeError('Invalid Rammerhead session.');
  const url = new URL(destination);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Rammerhead only supports HTTP and HTTPS destinations.');
  return `/${id}/${url.href}`;
}

function serverInfo(request) {
  const forwardedHost = firstHeader(request.headers['x-forwarded-host']) || firstHeader(request.headers.host) || 'localhost';
  const parsedHost = new URL(`http://${forwardedHost}`);
  const forwardedProtocol = firstHeader(request.headers['x-forwarded-proto']).replace(/:$/, '');
  const protocol = `${forwardedProtocol || (request.socket.encrypted ? 'https' : 'http')}:`;
  const port = Number(parsedHost.port || (protocol === 'https:' ? 443 : 80));
  return { hostname: parsedHost.hostname, port, crossDomainPort: port, protocol };
}

export function createRammerheadRuntime() {
  const logger = new RammerheadLogging({ logLevel: process.env.NODE_ENV === 'test' ? 'disabled' : 'warn' });
  const proxy = new RammerheadProxy({
    logger,
    bindingAddress: '127.0.0.1',
    port: 0,
    crossDomainPort: null,
    dontListen: true,
    getServerInfo: serverInfo,
    jsCache: new RammerheadJSMemCache(50 * 1024 * 1024)
  });
  const sessions = new RammerheadSessionMemoryStore({
    logger,
    staleTimeout: 1000 * 60 * 60,
    maxToLive: 1000 * 60 * 60 * 8,
    cleanupInterval: 1000 * 60 * 5
  });
  sessions.attachToProxy(proxy);

  return {
    createSession(preferredId) {
      if (typeof preferredId === 'string' && /^[a-f0-9]{32}$/i.test(preferredId) && sessions.has(preferredId)) return preferredId;
      const id = generateId();
      sessions.add(id);
      return id;
    },
    handleRequest(request, response) { proxy.server1.emit('request', request, response); },
    handleUpgrade(request, socket, head) { proxy.server1.emit('upgrade', request, socket, head); },
    close() { proxy.close(); }
  };
}
