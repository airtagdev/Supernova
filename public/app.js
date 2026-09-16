import { resolveInput, gameTarget, engines } from './resolve.js';
const $ = id => document.getElementById(id);
const defaults = { title: '', icon: '', engine: 'duckduckgo', collapsed: false, preset: 'custom' };
const tabPresets = {
  classroom: { title: 'Google Classroom', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  drive: { title: 'Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png' },
  docs: { title: 'Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  khan: { title: 'Khan Academy', icon: 'https://www.khanacademy.org/favicon.ico' },
  socrative: { title: 'Socrative', icon: 'https://www.google.com/s2/favicons?domain=socrative.com&sz=128' }
};
const serviceWorkerUrl = '/sw.js?v=20260916-1';
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('supernova.settings') || '{}') }; } catch { settings = { ...defaults }; }
if (!engines[settings.engine]) settings.engine = defaults.engine;
if (settings.preset !== 'custom' && !tabPresets[settings.preset]) settings.preset = defaults.preset;
if (typeof settings.title !== 'string') settings.title = '';
if (typeof settings.icon !== 'string' || !/^data:image\/(png|jpeg|webp|x-icon|vnd.microsoft.icon);base64,/.test(settings.icon)) settings.icon = '';
let proxy, initializing, currentFrame, activeUrl, localGame = false, games = [], navigationId = 0, loadTimer;
function notify(message, retry = false) { $('notice-text').textContent = message; $('retry').hidden = !retry; $('notice').hidden = false; }
function save() { try { localStorage.setItem('supernova.settings', JSON.stringify(settings)); $('saved').textContent = 'Saved on this browser'; } catch { notify('Your browser could not save these settings.'); } }
function appearance() { const preset = tabPresets[settings.preset]; document.title = preset?.title || settings.title.trim() || 'Supernova'; $('favicon').href = preset?.icon || settings.icon || '/icons/star.svg'; $('icon-preview').src = $('favicon').href; }
appearance();
const presetSelect = $('tab-preset');
$('tab-title').value = settings.title; $('engine').value = settings.engine; if (presetSelect) presetSelect.value = settings.preset;
presetSelect?.addEventListener('change', event => { settings.preset = event.target.value; appearance(); save(); });
$('tab-title').addEventListener('input', event => { settings.preset = 'custom'; if (presetSelect) presetSelect.value = 'custom'; settings.title = event.target.value; appearance(); save(); });
$('engine').addEventListener('change', event => { settings.engine = event.target.value; save(); });
$('icon-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 256 * 1024 || !['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].includes(file.type)) return notify('Choose a PNG, JPG, WebP or ICO smaller than 256 KB.');
  try { const bitmap = await createImageBitmap(file); bitmap.close(); const reader = new FileReader(); reader.onload = () => { settings.preset = 'custom'; if (presetSelect) presetSelect.value = 'custom'; settings.icon = reader.result; appearance(); save(); }; reader.readAsDataURL(file); } catch { notify('This image could not be opened. Try a PNG or WebP.'); }
});
$('reset').onclick = () => { settings = { ...defaults }; $('tab-title').value = ''; $('engine').value = settings.engine; if (presetSelect) presetSelect.value = settings.preset; $('icon-file').value = ''; appearance(); save(); };
$('dismiss').onclick = () => $('notice').hidden = true;
function collapse(value) { settings.collapsed = value; $('toolbar').hidden = value; $('expand').hidden = !value; save(); }
$('collapse').onclick = () => { collapse(true); $('expand').focus(); };
$('expand').onclick = () => { collapse(false); $('collapse').focus(); };
const changelog = $('changelog-modal');
const showChangelogOnLoad = !location.hash || location.hash === '#home';
let changelogDismissed = false;
function openChangelog() {
  if (!changelog || !showChangelogOnLoad || changelogDismissed || !changelog.hidden) return;
  changelog.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => $('changelog-close').focus());
}
function closeChangelog(immediate = false) {
  if (!changelog || changelog.hidden) return;
  changelogDismissed = true;
  document.body.classList.remove('modal-open');
  if (immediate) { changelog.hidden = true; return; }
  changelog.classList.add('is-closing');
  setTimeout(() => { changelog.hidden = true; changelog.classList.remove('is-closing'); $('query').focus(); }, 170);
}
if (changelog) {
  $('changelog-close').addEventListener('click', () => closeChangelog());
  changelog.querySelector('[data-changelog-close]').addEventListener('click', () => closeChangelog());
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && changelog && !changelog.hidden) closeChangelog(); });

const chatClientId = sessionStorage.getItem('supernova.chat.id') || (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
sessionStorage.setItem('supernova.chat.id', chatClientId);
let chatStream = null;
function appendChatMessage(message) {
  if (!$('chat-messages')) return;
  const item = document.createElement('article');
  if (message.type === 'system') {
    item.className = 'chat-message system';
    item.textContent = message.text;
  } else {
    item.className = 'chat-message';
    const meta = document.createElement('div');
    const author = document.createElement('strong'); author.textContent = message.name;
    const time = document.createElement('time'); time.dateTime = message.time;
    time.textContent = new Date(message.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const text = document.createElement('p'); text.textContent = message.text;
    meta.append(author, time); item.append(meta, text);
  }
  $('chat-messages').append(item);
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
}
function leaveChat(showGate = true) {
  chatStream?.close(); chatStream = null;
  if (!$('chat-room')) return;
  $('chat-room').hidden = true;
  if (showGate) $('chat-gate').hidden = false;
  $('chat-presence').textContent = 'Offline';
}
if ($('chat-join')) {
$('chat-join').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('chat-name').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return notify('Choose a name with at least 2 characters.');
  leaveChat(false);
  $('chat-join').querySelector('button').disabled = true;
  const stream = new EventSource(`/api/chat/events?clientId=${encodeURIComponent(chatClientId)}&name=${encodeURIComponent(name)}`);
  chatStream = stream;
  stream.addEventListener('open', () => {
    if (chatStream !== stream) return;
    $('chat-join').querySelector('button').disabled = false;
    $('chat-gate').hidden = true; $('chat-room').hidden = false;
    $('chat-message').focus();
  });
  stream.addEventListener('message', event => {
    if (chatStream !== stream) return;
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'history') {
        $('chat-messages').replaceChildren();
        for (const message of payload.messages || []) appendChatMessage(message);
      } else if (payload.type === 'presence') {
        $('chat-presence').textContent = `${payload.count} online`;
      } else if (payload.type === 'message' || payload.type === 'system') appendChatMessage(payload);
    } catch {}
  });
  stream.addEventListener('error', () => {
    if (chatStream === stream) $('chat-presence').textContent = 'Reconnecting…';
    $('chat-join').querySelector('button').disabled = false;
  });
});
$('chat-send').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('chat-message'); const message = input.value.trim();
  if (!message || !chatStream) return;
  const button = $('chat-send').querySelector('button'); button.disabled = true;
  try {
    const response = await fetch('/api/chat/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: chatClientId, message }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Message could not be sent.');
    input.value = '';
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; input.focus(); }
});
$('chat-leave').addEventListener('click', () => { leaveChat(); $('chat-name').focus(); });
}
function cleanup() { navigationId++; clearTimeout(loadTimer); currentFrame?.frame.remove(); currentFrame = null; $('frame-host').replaceChildren(); }
function route() {
  const page = location.hash.slice(1) || 'home';
  if (page === 'browse' && activeUrl) return;
  cleanup(); const selected = ['home','games','chat','settings'].includes(page) ? page : 'home';
  if (selected !== 'home') closeChangelog(true);
  if (selected !== 'chat') leaveChat();
  $('viewer').hidden = true; $('nav').hidden = false; $('notice').hidden = true;
  for (const id of ['home','games','chat','settings']) { const pageElement = $(id); if (pageElement) pageElement.hidden = id !== selected; }
  document.querySelectorAll('nav a').forEach(link => { if (link.hash === '#' + selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
}
window.addEventListener('hashchange', route); route(); openChangelog();
function loadScript(src) { return new Promise((resolve,reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Could not load proxy files. Please retry.')); }; document.head.append(script); }); }
async function initialize() {
  if (proxy) return proxy;
  if (initializing) return initializing;
  initializing = (async () => {
    if (!window.isSecureContext || !navigator.serviceWorker) throw new Error('Browsing requires HTTPS or localhost and service worker support.');
    if (!window.$scramjetLoadController) await loadScript('/scram/scramjet.all.js');
    if (!window.BareMux) await loadScript('/baremux/index.js');
    const { ScramjetController } = $scramjetLoadController();
    const controller = new ScramjetController({ prefix: '/service/', files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' } });
    await controller.init();
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' });
    await registration.update();
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller || !navigator.serviceWorker.controller.scriptURL.includes(serviceWorkerUrl)) {
      await Promise.race([
        new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('The proxy worker did not start. Select Retry to repair it.')), 10000))
      ]);
    }
    const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    await connection.setTransport('/libcurl/index.mjs', [{ websocket: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` }]);
    proxy = controller; return controller;
  })();
  try { return await initializing; } finally { initializing = null; }
}
async function repairProxy() {
  proxy = null; initializing = null;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter(registration => registration.scope === `${location.origin}/`).map(registration => registration.unregister()));
  sessionStorage.setItem('supernova.reopen', JSON.stringify({ url: activeUrl, local: localGame }));
  location.reload();
}
async function openContent(url, local = false) {
  cleanup(); const token = navigationId; activeUrl = url; localGame = local;
  location.hash = 'browse'; $('nav').hidden = true;
  for (const id of ['home','games','chat','settings']) { const pageElement = $(id); if (pageElement) pageElement.hidden = true; }
  $('viewer').hidden = false; collapse(Boolean(settings.collapsed)); $('address').value = url;
  notify(local ? 'Opening game…' : 'Connecting…');
  loadTimer = setTimeout(() => { if (token === navigationId) notify('This page is taking longer than expected. You can retry or try another website.', true); }, 20000);
  try {
    if (local) currentFrame = { frame: document.createElement('iframe') };
    else { const controller = await initialize(); if (token !== navigationId) return; currentFrame = controller.createFrame(); }
    const frame = currentFrame.frame;
    frame.title = local ? 'Game' : 'Proxied website';
    frame.setAttribute('allow', 'fullscreen; autoplay; gamepad');
    frame.addEventListener('load', () => { clearTimeout(loadTimer); $('notice').hidden = true; });
    $('frame-host').replaceChildren(frame);
    if (local) frame.src = url; else currentFrame.go(url);
  } catch (error) { if (token === navigationId) { clearTimeout(loadTimer); notify(error.message || 'Unable to open this page.', true); } }
}
for (const [form, input] of [['search','query'], ['address-form','address']]) $(form).addEventListener('submit', event => {
  event.preventDefault(); try { openContent(resolveInput($(input).value, settings.engine)); } catch (error) { notify(error.message); }
});
$('retry').onclick = async () => {
  if (!activeUrl) return;
  if (localGame) return openContent(activeUrl, true);
  try { await repairProxy(); } catch { openContent(activeUrl, false); }
};
$('reload').onclick = () => {
  try { if (currentFrame?.reload) currentFrame.reload(); else if (currentFrame) currentFrame.frame.contentWindow.location.reload(); else if (activeUrl) openContent(activeUrl, localGame); }
  catch { openContent(activeUrl, localGame); }
};
function renderGames() {
  const query = $('filter').value.trim().toLowerCase(); const visible = games.filter(game => game.name.toLowerCase().includes(query));
  $('game-grid').replaceChildren(); $('empty').hidden = visible.length > 0;
  $('empty').textContent = games.length ? 'No games match your search.' : 'Your collection is ready for its first game.';
  for (const game of visible) {
    const button = document.createElement('button'); button.className = 'game';
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.crossOrigin = 'anonymous'; img.src = game.icon; img.onerror = () => { img.onerror = null; img.removeAttribute('crossorigin'); img.src = '/icons/star.svg'; };
    const label = document.createElement('span'); label.textContent = game.name;
    button.append(img, label); button.onclick = () => { try { const target = gameTarget(game.link, location.origin); openContent(target.url, target.local); } catch (error) { notify(error.message); } };
    $('game-grid').append(button);
  }
}
$('filter').addEventListener('input', renderGames);
fetch('/games.json').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  if (!Array.isArray(data) || data.some(game => !game || !['name','icon','link'].every(key => typeof game[key] === 'string' && game[key].trim()))) throw new Error();
  games = data; renderGames();
}).catch(() => { $('empty').textContent = 'The game collection could not be loaded. Please check games.json and reload.'; });
try {
  const reopen = JSON.parse(sessionStorage.getItem('supernova.reopen') || 'null');
  sessionStorage.removeItem('supernova.reopen');
  if (reopen?.url && typeof reopen.url === 'string') setTimeout(() => openContent(reopen.url, Boolean(reopen.local)));
} catch { sessionStorage.removeItem('supernova.reopen'); }
