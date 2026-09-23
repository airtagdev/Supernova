import { applyBps, crc32, inspectBps, normalizeSource } from './bps.js';

const games = {
  'awesome-mario-world': { name: 'Awesome Mario World', patch: 'awesome-mario-world.bps', icon: '/icons/games/mario/awesome-mario-world.jpg' },
  'mega-mario-world': { name: 'Mega Mario World', patch: 'mega-mario-world.bps', icon: '/icons/games/mario/mega-mario-world.jpg' },
  'super-mario-legacy': { name: 'Super Mario Legacy', patch: 'super-mario-legacy.bps', icon: '/icons/games/mario/super-mario-legacy.jpg' },
  'superstar-mario-world': { name: 'Superstar Mario World', patch: 'superstar-mario-world.bps', icon: '/icons/games/mario/superstar-mario-world.jpg' },
  'total-mario-world': { name: 'Total Mario World', patch: 'total-mario-world.bps', icon: '/icons/games/mario/total-mario-world.jpg' }
};

const $ = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('game') || '';
const game = games[slug];
let patchPromise;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('supernova.smw-games', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('roms');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local game storage is unavailable.'));
  });
}

async function stored(key, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('roms', value === undefined ? 'readonly' : 'readwrite');
    const request = value === undefined ? transaction.objectStore('roms').get(key) : transaction.objectStore('roms').put(value, key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not access local game storage.'));
    transaction.oncomplete = () => database.close();
  });
}

function showSetup(message) {
  $('loading').hidden = true;
  $('game').hidden = true;
  $('setup').hidden = false;
  $('message').textContent = message || 'Select a clean Super Mario World (USA) ROM to prepare this game.';
}

async function getPatch() {
  patchPromise ||= fetch(`/games/smw/patches/${game.patch}?v=0.1.21`).then(response => {
    if (!response.ok) throw new Error('The game patch could not be downloaded.');
    return response.arrayBuffer();
  }).then(buffer => new Uint8Array(buffer));
  return patchPromise;
}

async function prepareGame(baseInput) {
  $('setup').hidden = true;
  $('loading').hidden = false;
  $('status').textContent = 'Applying game patch…';
  const patch = await getPatch();
  const info = inspectBps(patch);
  const base = normalizeSource(baseInput, info.sourceSize);
  const rom = applyBps(base, patch);
  await Promise.all([
    stored('base:super-mario-world-usa', base.slice().buffer),
    stored(`game:${slug}:${info.targetCrc.toString(16)}`, rom.buffer)
  ]);
  return rom;
}

function launch(rom) {
  $('setup').hidden = true;
  $('loading').hidden = true;
  $('game').hidden = false;
  const gameUrl = URL.createObjectURL(new Blob([rom], { type: 'application/octet-stream' }));
  window.EJS_player = '#game';
  window.EJS_core = 'snes';
  window.EJS_gameName = game.name;
  window.EJS_gameID = `supernova-${slug}`;
  window.EJS_gameUrl = gameUrl;
  window.EJS_pathtodata = '/emulatorjs/';
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  window.EJS_color = '#97aed9';
  window.EJS_ready = () => {
    window.focus();
    $('game').focus({ preventScroll: true });
  };
  const loader = document.createElement('script');
  loader.src = '/emulatorjs/loader.js?v=4.2.3';
  loader.onerror = () => showSetup('The SNES player could not be loaded. Reload and try again.');
  document.body.append(loader);
}

async function start() {
  if (!game) return showSetup('This game is not available. Return to the Supernova game library.');
  document.title = game.name;
  $('title').textContent = game.name;
  $('art').src = game.icon;
  try {
    const patch = await getPatch();
    const info = inspectBps(patch);
    const cached = await stored(`game:${slug}:${info.targetCrc.toString(16)}`);
    if (cached && crc32(new Uint8Array(cached)) === info.targetCrc) return launch(new Uint8Array(cached));
    const base = await stored('base:super-mario-world-usa');
    if (base) return launch(await prepareGame(new Uint8Array(base)));
    showSetup();
  } catch (error) { showSetup(error.message || 'The game could not be prepared.'); }
}

$('base-rom').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { launch(await prepareGame(new Uint8Array(await file.arrayBuffer()))); }
  catch (error) { showSetup(error.message || 'The selected ROM could not be used.'); }
  finally { event.target.value = ''; }
});

start();
