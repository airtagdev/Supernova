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
  window.EJS_gameUrl = `/api/games/smw/${slug}`;
  window.EJS_pathtodata = '/emulatorjs/';
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  window.EJS_color = '#97aed9';
  window.EJS_ready = () => {
    $('loading').hidden = true;
    window.focus();
    $('game').focus({ preventScroll: true });
  };
  window.EJS_onGameStart = window.EJS_ready;
  const loader = document.createElement('script');
  loader.src = '/emulatorjs/loader.js?v=4.2.3';
  loader.onerror = () => showError('The SNES player could not be loaded. Reload and try again.');
  document.body.append(loader);
}

launch();
