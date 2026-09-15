import { resolveInput, gameTarget, engines } from './resolve.js';
const $ = id => document.getElementById(id);
const defaults = { title: '', icon: '', engine: 'duckduckgo', collapsed: false };
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('supernova.settings') || '{}') }; } catch { settings = { ...defaults }; }
if (!engines[settings.engine]) settings.engine = defaults.engine;
if (typeof settings.title !== 'string') settings.title = '';
if (typeof settings.icon !== 'string' || !/^data:image\/(png|jpeg|webp|x-icon|vnd.microsoft.icon);base64,/.test(settings.icon)) settings.icon = '';
let proxy, initializing, currentFrame, activeUrl, localGame = false, games = [], navigationId = 0, loadTimer;
function notify(message, retry = false) { $('notice-text').textContent = message; $('retry').hidden = !retry; $('notice').hidden = false; }
function save() { try { localStorage.setItem('supernova.settings', JSON.stringify(settings)); $('saved').textContent = 'Saved on this browser'; } catch { notify('Your browser could not save these settings.'); } }
function appearance() { document.title = settings.title.trim() || 'Supernova'; $('favicon').href = settings.icon || '/icons/star.svg'; $('icon-preview').src = $('favicon').href; }
appearance();
$('tab-title').value = settings.title; $('engine').value = settings.engine;
$('tab-title').addEventListener('input', event => { settings.title = event.target.value; appearance(); save(); });
$('engine').addEventListener('change', event => { settings.engine = event.target.value; save(); });
$('icon-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 256 * 1024 || !['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].includes(file.type)) return notify('Choose a PNG, JPG, WebP or ICO smaller than 256 KB.');
  try { const bitmap = await createImageBitmap(file); bitmap.close(); const reader = new FileReader(); reader.onload = () => { settings.icon = reader.result; appearance(); save(); }; reader.readAsDataURL(file); } catch { notify('This image could not be opened. Try a PNG or WebP.'); }
});
$('reset').onclick = () => { settings = { ...defaults }; $('tab-title').value = ''; $('engine').value = settings.engine; $('icon-file').value = ''; appearance(); save(); };
$('dismiss').onclick = () => $('notice').hidden = true;
function collapse(value) { settings.collapsed = value; $('toolbar').hidden = value; $('expand').hidden = !value; save(); }
$('collapse').onclick = () => { collapse(true); $('expand').focus(); };
$('expand').onclick = () => { collapse(false); $('collapse').focus(); };
function cleanup() { navigationId++; clearTimeout(loadTimer); currentFrame?.frame.remove(); currentFrame = null; $('frame-host').replaceChildren(); }
function route() {
  const page = location.hash.slice(1) || 'home';
  if (page === 'browse' && activeUrl) return;
  cleanup(); const selected = ['home','games','settings'].includes(page) ? page : 'home';
  $('viewer').hidden = true; $('nav').hidden = false; $('notice').hidden = true;
  for (const id of ['home','games','settings']) $(id).hidden = id !== selected;
  document.querySelectorAll('nav a').forEach(link => { if (link.hash === '#' + selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
}
window.addEventListener('hashchange', route); route();
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
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    await connection.setTransport('/libcurl/index.mjs', [{ websocket: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` }]);
    proxy = controller; return controller;
  })();
  try { return await initializing; } finally { initializing = null; }
}
async function openContent(url, local = false) {
  cleanup(); const token = navigationId; activeUrl = url; localGame = local;
  location.hash = 'browse'; $('nav').hidden = true;
  for (const id of ['home','games','settings']) $(id).hidden = true;
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
$('retry').onclick = () => activeUrl && openContent(activeUrl, localGame);
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
