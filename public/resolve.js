export const engines = { duckduckgo: 'https://duckduckgo.com/?q=', google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', brave: 'https://search.brave.com/search?q=' };
export function resolveInput(value, engine = 'duckduckgo') {
  const input = value.trim();
  if (!input) throw new Error('Enter a search or website address.');
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[\w.-]+:\d+(?:\/|$)/.test(input)) {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an http or https website address.');
    return url.href;
  }
  if (!/\s/.test(input) && /^(localhost|(?:[\w-]+\.)+[\w-]+)(:\d+)?([/?#].*)?$/.test(input)) return new URL('https://' + input).href;
  return (engines[engine] || engines.duckduckgo) + encodeURIComponent(input);
}
export function gameTarget(link, origin) {
  const url = new URL(link, origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid game link.');
  return { url: url.href, local: url.origin === origin };
}
