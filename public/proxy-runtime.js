export const workerUrl = '/sw.js?v=20260923-2';
export const ultravioletWorkerUrl = '/uv-sw.js?v=20260923-2';

export function scramjetConfig() {
  return {
    prefix: '/service/',
    files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' },
    // Scramjet 1.1 drops synchronous XHR by default. Some game loaders need it.
    // Match the destination, including nested game/CDN frames, not the portal UI.
    siteFlags: {
      '^https?://([a-z0-9-]+\\.)*(poki\\.com|poki-cdn\\.com|poki-gdn\\.com|crazygames\\.com|crazygamesfiles\\.com)(:[0-9]+)?/': { syncxhr: true }
    }
  };
}

export function withTimeout(promise, message, milliseconds = 15000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

// serviceWorker.ready can resolve to an OLD worker. Wait for the exact version.
export function waitForWorker(container, registration, scriptURL, milliseconds = 15000, requireControl = true) {
  return new Promise((resolve, reject) => {
    const watched = new Set();
    const finish = error => {
      clearTimeout(timer);
      container.removeEventListener('controllerchange', check);
      registration.removeEventListener('updatefound', check);
      for (const worker of watched) worker.removeEventListener('statechange', check);
      error ? reject(error) : resolve(registration);
    };
    const check = () => {
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !watched.has(worker)) { watched.add(worker); worker.addEventListener('statechange', check); }
      }
      if (registration.waiting?.scriptURL === scriptURL) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      if (registration.active?.scriptURL === scriptURL && registration.active.state === 'activated'
          && (!requireControl || container.controller === registration.active)) finish();
      else if ([...watched].some(worker => worker.scriptURL === scriptURL && worker.state === 'redundant')
          && ![registration.installing, registration.waiting, registration.active].some(worker => worker?.scriptURL === scriptURL && worker.state !== 'redundant')) {
        finish(new Error('The proxy worker failed to install. Select Retry to repair it.'));
      }
    };
    const timer = setTimeout(() => finish(new Error('The proxy worker did not take control. Select Retry to repair it.')), milliseconds);
    container.addEventListener('controllerchange', check);
    registration.addEventListener('updatefound', check);
    check();
  });
}

export function isOwnedWorker(registration, origin) {
  return [registration.active, registration.waiting, registration.installing].some(worker => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === origin && ['/sw.js', '/uv-sw.js'].includes(url.pathname);
  });
}

export async function registerProxyWorker(container, origin, engine = 'scramjet') {
  const ultraviolet = engine === 'ultraviolet';
  const url = ultraviolet ? ultravioletWorkerUrl : workerUrl;
  const registration = await withTimeout(
    container.register(url, { scope: ultraviolet ? '/uv/service/' : '/', updateViaCache: 'none' }),
    'Could not register the proxy worker. Select Retry to repair it.'
  );
  // A scoped UV worker cannot control the portal page at /. It only needs to
  // be active before the first /uv/service/ iframe navigation.
  await waitForWorker(container, registration, new URL(url, origin).href, 15000, !ultraviolet);
  return registration;
}
