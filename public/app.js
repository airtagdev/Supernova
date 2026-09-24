import { resolveInput, gameTarget, engines } from './resolve.js';
import { scramjetConfig, registerProxyWorker, isOwnedWorker, withTimeout } from './proxy-runtime.js?v=20260924-1';
const $ = id => document.getElementById(id);
const defaults = { title: '', icon: '', engine: 'duckduckgo', preset: 'custom', theme: 'graphite', proxyEngine: 'scramjet' };
const themes = new Set(['graphite', 'midnight', 'obsidian']);
const proxyEngines = new Set(['scramjet', 'ultraviolet']);
const tabPresets = {
  classroom: { title: 'Google Classroom', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  drive: { title: 'Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png' },
  docs: { title: 'Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  khan: { title: 'Khan Academy', icon: 'https://www.khanacademy.org/favicon.ico' },
  socrative: { title: 'Socrative', icon: 'https://www.google.com/s2/favicons?domain=socrative.com&sz=128' }
};
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('supernova.settings') || '{}') }; } catch { settings = { ...defaults }; }
if (!engines[settings.engine]) settings.engine = defaults.engine;
if (settings.preset !== 'custom' && !tabPresets[settings.preset]) settings.preset = defaults.preset;
if (!themes.has(settings.theme)) settings.theme = defaults.theme;
if (!proxyEngines.has(settings.proxyEngine)) settings.proxyEngine = defaults.proxyEngine;
if (typeof settings.title !== 'string') settings.title = '';
if (typeof settings.icon !== 'string' || !/^data:image\/(png|jpeg|webp|x-icon|vnd.microsoft.icon);base64,/.test(settings.icon)) settings.icon = '';
let bookmarks = [];
try {
  const stored = JSON.parse(localStorage.getItem('supernova.bookmarks') || '[]');
  if (Array.isArray(stored)) bookmarks = stored.filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && /^https?:\/\//.test(item.url)).slice(0, 100);
} catch {}
let scramjetProxy, scramjetInitializing, ultravioletInitializing, transportInitializing, currentFrame, activeUrl, activeLabel = '', localGame = false, activeGame = false, games = [], gamesPromise, navigationId = 0, loadTimer, gameCollapseTimer;
const workerInitializers = new Map();
function notify(message, retry = false) { $('notice-text').textContent = message; $('retry').hidden = !retry; $('notice').hidden = false; }
function save() { try { localStorage.setItem('supernova.settings', JSON.stringify(settings)); $('saved').textContent = 'Saved on this browser'; } catch { notify('Your browser could not save these settings.'); } }
function saveBookmarks() {
  try { localStorage.setItem('supernova.bookmarks', JSON.stringify(bookmarks)); }
  catch { notify('Your browser could not save this bookmark.'); }
}
function bookmarkTitle() {
  if (activeLabel) return activeLabel;
  try {
    const title = currentFrame?.frame.contentDocument?.title?.replace(/\s+/g, ' ').trim();
    if (title) return title.slice(0, 80);
  } catch {}
  try { return new URL(activeUrl).hostname.replace(/^www\./, '') || 'Saved page'; }
  catch { return 'Saved page'; }
}
function bookmarkIndex(url = activeUrl) { return bookmarks.findIndex(item => item.url === url); }
function updateBookmarkButton() {
  const button = $('bookmark'); if (!button) return;
  const saved = Boolean(activeUrl) && bookmarkIndex() !== -1;
  button.textContent = saved ? '★' : '☆';
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', saved ? 'Remove bookmark' : 'Add bookmark');
  button.title = saved ? 'Remove bookmark' : 'Add bookmark';
}
function renderBookmarks() {
  const list = $('bookmarks-list'); if (!list) return;
  list.replaceChildren();
  $('bookmarks-empty').hidden = bookmarks.length > 0;
  $('bookmarks-count').textContent = bookmarks.length ? String(bookmarks.length) : '';
  for (const item of bookmarks) {
    const row = document.createElement('div'); row.className = 'bookmark-row';
    const open = document.createElement('button'); open.className = 'bookmark-open'; open.textContent = item.title; open.title = item.title;
    open.addEventListener('click', () => openContent(item.url, Boolean(item.local), Boolean(item.game), item.title));
    const remove = document.createElement('button'); remove.className = 'bookmark-delete'; remove.type = 'button'; remove.setAttribute('aria-label', `Delete ${item.title}`); remove.title = `Delete ${item.title}`;
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg>';
    remove.addEventListener('click', () => { bookmarks = bookmarks.filter(bookmark => bookmark.id !== item.id); saveBookmarks(); renderBookmarks(); updateBookmarkButton(); });
    row.append(open, remove); list.append(row);
  }
}
function appearance() { const preset = tabPresets[settings.preset]; document.title = preset?.title || settings.title.trim() || 'Supernova'; $('favicon').href = preset?.icon || settings.icon || '/icons/star.svg'; $('icon-preview').src = $('favicon').href; }
function applyTheme() { document.documentElement.dataset.theme = settings.theme; }
appearance();
applyTheme();
const presetSelect = $('tab-preset');
const proxySelect = $('proxy-engine');
$('tab-title').value = settings.title; $('engine').value = settings.engine; if (proxySelect) proxySelect.value = settings.proxyEngine; const themeSelect = $('theme'); if (themeSelect) themeSelect.value = settings.theme; if (presetSelect) presetSelect.value = settings.preset;
themeSelect?.addEventListener('change', event => { settings.theme = themes.has(event.target.value) ? event.target.value : defaults.theme; applyTheme(); save(); });
presetSelect?.addEventListener('change', event => { settings.preset = event.target.value; appearance(); save(); });
$('tab-title').addEventListener('input', event => { settings.preset = 'custom'; if (presetSelect) presetSelect.value = 'custom'; settings.title = event.target.value; appearance(); save(); });
$('engine').addEventListener('change', event => { settings.engine = event.target.value; save(); });
proxySelect?.addEventListener('change', event => { settings.proxyEngine = proxyEngines.has(event.target.value) ? event.target.value : defaults.proxyEngine; save(); });
$('icon-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 256 * 1024 || !['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].includes(file.type)) return notify('Choose a PNG, JPG, WebP or ICO smaller than 256 KB.');
  try { const bitmap = await createImageBitmap(file); bitmap.close(); const reader = new FileReader(); reader.onload = () => { settings.preset = 'custom'; if (presetSelect) presetSelect.value = 'custom'; settings.icon = reader.result; appearance(); save(); }; reader.readAsDataURL(file); } catch { notify('This image could not be opened. Try a PNG or WebP.'); }
});
$('reset').onclick = () => { settings = { ...defaults }; $('tab-title').value = ''; $('engine').value = settings.engine; if (proxySelect) proxySelect.value = settings.proxyEngine; if (themeSelect) themeSelect.value = settings.theme; if (presetSelect) presetSelect.value = settings.preset; $('icon-file').value = ''; applyTheme(); appearance(); save(); };
$('dismiss').onclick = () => $('notice').hidden = true;
let toolbarHintTimer;
function hideToolbarHint() { clearTimeout(toolbarHintTimer); const hint = $('toolbar-hint'); if (hint) hint.hidden = true; }
function showToolbarHint() {
  const hint = $('toolbar-hint'); if (!hint) return;
  clearTimeout(toolbarHintTimer); hint.hidden = false;
  toolbarHintTimer = setTimeout(hideToolbarHint, 3000);
}
function collapse(value, showHint = false) { $('toolbar').hidden = value; $('expand').hidden = !value; if (value && showHint) showToolbarHint(); else hideToolbarHint(); }
$('collapse').onclick = () => { collapse(true); $('expand').focus(); };
$('expand').onclick = () => { collapse(false); $('collapse').focus(); };
$('toolbar-hint')?.addEventListener('click', () => { collapse(false); $('collapse').focus(); });
$('bookmark')?.addEventListener('click', () => {
  if (!activeUrl) return;
  const index = bookmarkIndex();
  if (index !== -1) bookmarks.splice(index, 1);
  else bookmarks.unshift({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: bookmarkTitle(), url: activeUrl, local: localGame, game: activeGame });
  bookmarks = bookmarks.slice(0, 100);
  saveBookmarks(); renderBookmarks(); updateBookmarkButton();
});
renderBookmarks();
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
  $('chat-room').hidden = true;
  if (showGate) $('chat-gate').hidden = false;
  $('chat-presence').textContent = 'Offline';
}
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
function cleanup() { navigationId++; clearTimeout(loadTimer); clearTimeout(gameCollapseTimer); hideToolbarHint(); currentFrame?.frame.remove(); currentFrame = null; $('frame-host').replaceChildren(); }
function route() {
  const page = location.hash.slice(1) || 'home';
  if (page === 'browse' && activeUrl) return;
  cleanup(); const selected = ['home','games','chat','settings'].includes(page) ? page : 'home';
  if (selected !== 'home') closeChangelog(true);
  if (selected !== 'chat') leaveChat();
  $('viewer').hidden = true; $('nav').hidden = false; $('notice').hidden = true;
  for (const id of ['home','games','chat','settings']) $(id).hidden = id !== selected;
  if (selected === 'games') loadGames();
  document.querySelectorAll('nav a').forEach(link => { if (link.hash === '#' + selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
}
window.addEventListener('hashchange', route); route(); openChangelog();
const scripts = new Map();
function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const script = document.createElement('script'); script.src = src;
  const pending = withTimeout(new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load proxy files. Please retry.'));
    document.head.append(script);
  }), 'Loading proxy files timed out. Please retry.').catch(error => {
    script.remove(); scripts.delete(src); throw error;
  });
  scripts.set(src, pending); return pending;
}
function requireProxySupport() {
  if (!window.isSecureContext || !navigator.serviceWorker) throw new Error('Browsing requires HTTPS or localhost and service worker support.');
  if (!window.crossOriginIsolated) throw new Error('Proxy isolation headers are missing. Check the deployment configuration.');
}
async function initializeWorker(engine) {
  if (workerInitializers.has(engine)) return workerInitializers.get(engine);
  const pending = registerProxyWorker(navigator.serviceWorker, location.origin, engine).catch(error => {
    workerInitializers.delete(engine); throw error;
  });
  workerInitializers.set(engine, pending);
  return pending;
}
async function initializeTransport() {
  if (transportInitializing) return transportInitializing;
  transportInitializing = (async () => {
    if (!window.BareMux) await loadScript('/baremux/index.js');
    const connection = window.supernovaBareMux ||= new BareMux.BareMuxConnection('/baremux/worker.js');
    await withTimeout((async () => {
      if (await connection.getTransport() !== '/libcurl/index.mjs') {
        await connection.setTransport('/libcurl/index.mjs', [{ websocket: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` }]);
      }
    })(), 'The proxy connection did not start. Select Retry to repair it.');
  })();
  try { return await transportInitializing; } catch (error) { transportInitializing = null; throw error; }
}
async function initializeScramjet() {
  if (scramjetProxy) return scramjetProxy;
  if (scramjetInitializing) return scramjetInitializing;
  scramjetInitializing = (async () => {
    requireProxySupport();
    if (!window.$scramjetLoadController) await loadScript('/scram/scramjet.all.js');
    const { ScramjetController } = $scramjetLoadController();
    const controller = new ScramjetController(scramjetConfig());
    // Persist configuration before the worker handles the first proxied request.
    await withTimeout(controller.init(), 'Could not initialize proxy storage. Please retry.');
    await initializeWorker('scramjet');
    // A new controller may have posted to the old worker before activation.
    // Publish the current configuration again to the worker that now owns us.
    await controller.modifyConfig(scramjetConfig());
    await initializeTransport();
    scramjetProxy = controller; return controller;
  })();
  try { return await scramjetInitializing; } finally { scramjetInitializing = null; }
}
async function initializeUltraviolet() {
  if (ultravioletInitializing) return ultravioletInitializing;
  ultravioletInitializing = (async () => {
    requireProxySupport();
    if (!window.Ultraviolet) await loadScript('/uv/uv.bundle.js');
    if (!window.__uv$config) await loadScript('/uv-config.js');
    await initializeWorker('ultraviolet');
    await initializeTransport();
    return window.__uv$config;
  })();
  try { return await ultravioletInitializing; } finally { ultravioletInitializing = null; }
}
async function repairProxy() {
  scramjetProxy = null; scramjetInitializing = null; ultravioletInitializing = null; transportInitializing = null; workerInitializers.clear();
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter(registration => isOwnedWorker(registration, location.origin) && (registration.scope === `${location.origin}/` || registration.scope === `${location.origin}/uv/service/`)).map(registration => registration.unregister()));
  sessionStorage.setItem('supernova.reopen', JSON.stringify({ url: activeUrl, label: activeLabel, local: localGame, game: activeGame }));
  location.reload();
}
async function openContent(url, local = false, game = false, label = '') {
  cleanup(); const token = navigationId; activeUrl = url; activeLabel = typeof label === 'string' ? label.trim().slice(0, 80) : ''; localGame = local; activeGame = game;
  location.hash = 'browse'; $('nav').hidden = true;
  for (const id of ['home','games','chat','settings']) $(id).hidden = true;
  $('viewer').hidden = false; collapse(false); $('address').value = url; updateBookmarkButton();
  notify(local ? 'Opening game…' : 'Connecting…');
  loadTimer = setTimeout(() => { if (token === navigationId) notify('This page is taking longer than expected. You can retry or try another website.', true); }, 20000);
  try {
    if (local) currentFrame = { frame: document.createElement('iframe') };
    else if (settings.proxyEngine === 'ultraviolet') {
      const config = await initializeUltraviolet(); if (token !== navigationId) return;
      currentFrame = { frame: document.createElement('iframe'), url: config.prefix + config.encodeUrl(url) };
    } else { const controller = await initializeScramjet(); if (token !== navigationId) return; currentFrame = controller.createFrame(); }
    const frame = currentFrame.frame;
    frame.title = local ? 'Game' : 'Proxied website';
    frame.tabIndex = -1;
    frame.setAttribute('allow', 'fullscreen; autoplay; gamepad');
    frame.addEventListener('load', () => {
      if (token !== navigationId) return;
      let failed = false;
      try {
        const doc = frame.contentDocument;
        if (doc?.URL === 'about:blank') return;
        failed = Boolean(doc?.querySelector('#supernova-proxy-error') || (doc?.querySelector('#errorTrace') && doc?.querySelector('#fetchedURL')));
      } catch {}
      clearTimeout(loadTimer); clearTimeout(gameCollapseTimer);
      if (failed) { collapse(false); notify('The proxy could not load this page. Retry or select another engine in Settings.', true); return; }
      $('notice').hidden = true; updateBookmarkButton();
      if (game) {
        collapse(true, true);
        requestAnimationFrame(() => {
          frame.focus({ preventScroll: true });
          try { frame.contentWindow?.focus(); } catch {}
        });
      }
    });
    if (local) frame.src = url; else if (currentFrame.go) currentFrame.go(url); else frame.src = currentFrame.url;
    $('frame-host').replaceChildren(frame);
  } catch (error) { if (token === navigationId) { clearTimeout(loadTimer); notify(error.message || 'Unable to open this page.', true); } }
}
for (const [form, input] of [['search','query'], ['address-form','address']]) $(form).addEventListener('submit', event => {
  event.preventDefault(); try { openContent(resolveInput($(input).value, settings.engine)); } catch (error) { notify(error.message); }
});
$('retry').onclick = async () => {
  if (!activeUrl) return;
  if (localGame) return openContent(activeUrl, true, activeGame, activeLabel);
  try { await repairProxy(); } catch { openContent(activeUrl, false, activeGame, activeLabel); }
};
$('back')?.addEventListener('click', () => {
  try { currentFrame?.frame.contentWindow.history.back(); }
  catch { notify('This page cannot go back yet.'); }
});
$('forward')?.addEventListener('click', () => {
  try { currentFrame?.frame.contentWindow.history.forward(); }
  catch { notify('This page cannot go forward yet.'); }
});
$('reload').onclick = () => {
  try { if (currentFrame?.reload) currentFrame.reload(); else if (currentFrame) currentFrame.frame.contentWindow.location.reload(); else if (activeUrl) openContent(activeUrl, localGame, activeGame, activeLabel); }
  catch { openContent(activeUrl, localGame, activeGame, activeLabel); }
};
function renderGames() {
  const query = $('filter').value.trim().toLowerCase(); const visible = games.filter(game => game.name.toLowerCase().includes(query));
  const fragment = document.createDocumentFragment(); $('empty').hidden = visible.length > 0;
  $('empty').textContent = games.length ? 'No games match your search.' : 'Your collection is ready for its first game.';
  for (const game of visible) {
    const button = document.createElement('button'); button.className = 'game';
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.fetchPriority = 'low'; img.referrerPolicy = 'no-referrer'; img.crossOrigin = 'anonymous'; img.src = game.icon; img.onerror = () => { img.onerror = null; img.removeAttribute('crossorigin'); img.src = '/icons/star.svg'; };
    const label = document.createElement('span'); label.textContent = game.name;
    button.append(img, label); button.onclick = () => { try { const target = gameTarget(game.link, location.origin); openContent(target.url, target.local, true, game.name); } catch (error) { notify(error.message); } };
    fragment.append(button);
  }
  $('game-grid').replaceChildren(fragment);
}
$('filter').addEventListener('input', renderGames);
function loadGames() {
  if (gamesPromise) return gamesPromise;
  $('empty').hidden = false; $('empty').textContent = 'Loading your collection…';
  gamesPromise = fetch('/games.json?v=0.1.31').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
    if (!Array.isArray(data) || data.some(game => !game || !['name','icon','link'].every(key => typeof game[key] === 'string' && game[key].trim()))) throw new Error();
    games = data; renderGames();
  }).catch(() => { gamesPromise = null; $('empty').hidden = false; $('empty').textContent = 'The game collection could not be loaded. Please reload and try again.'; });
  return gamesPromise;
}
try {
  const reopen = JSON.parse(sessionStorage.getItem('supernova.reopen') || 'null');
  sessionStorage.removeItem('supernova.reopen');
  if (reopen?.url && typeof reopen.url === 'string') setTimeout(() => openContent(reopen.url, Boolean(reopen.local), Boolean(reopen.game), typeof reopen.label === 'string' ? reopen.label : ''));
} catch { sessionStorage.removeItem('supernova.reopen'); }
