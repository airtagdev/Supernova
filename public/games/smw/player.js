const games = Object.freeze({
  'awesome-mario-world': 'Awesome Mario World',
  'mega-mario-world': 'Mega Mario World',
  'super-mario-legacy': 'Super Mario Legacy',
  'superstar-mario-world': 'Superstar Mario World',
  'total-mario-world': 'Total Mario World'
});

const $ = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('game') || '';
const name = games[slug];
let started = false;

function showError(message) {
  $('loading').hidden = true;
  $('game').replaceChildren();
  $('error').hidden = false;
  $('message').textContent = message;
}

function launch() {
  if (!name) return showError('This game is not available. Return to the Supernova game library.');
  document.title = name;
  window.EJS_player = '#game';
  window.EJS_core = 'snes';
  window.EJS_gameName = name;
  window.EJS_gameID = `supernova-${slug}`;
  window.EJS_gameUrl = `/games/smw/roms/${slug}.sfc?v=0.1.25`;
  window.EJS_pathtodata = '/emulatorjs/';
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  window.EJS_forceLegacyCores = true;
  window.EJS_videoRotation = 0;
  window.EJS_disableDatabases = true;
  window.EJS_disableLocalStorage = true;
  window.EJS_DEBUG_XX = true;
  window.EJS_color = '#97aed9';
  window.EJS_ready = () => {
    $('status').textContent = 'Downloading and starting game…';
  };
  window.EJS_onGameStart = () => {
    started = true;
    $('loading').hidden = true;
    window.focus();
    $('game').focus({ preventScroll: true });
  };
  const loader = document.createElement('script');
  loader.src = '/emulatorjs/loader.js?v=4.2.3';
  loader.onerror = () => showError('The SNES player could not be loaded. Reload and try again.');
  document.body.append(loader);
  setTimeout(() => {
    if (started) return;
    const detail = window.EJS_emulator?.textElem?.innerText?.trim();
    showError(detail && !/^loading/i.test(detail) ? detail : 'The game took too long to start. Reload and try again.');
  }, 45000);
}

launch();
