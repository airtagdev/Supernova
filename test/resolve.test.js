import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInput, gameTarget } from '../public/resolve.js';
test('searches use DuckDuckGo by default and encode text', () => assert.equal(resolveInput('a & b'), 'https://duckduckgo.com/?q=a%20%26%20b'));
test('web addresses preserve paths and query parameters', () => assert.equal(resolveInput('example.com/path?q=1'), 'https://example.com/path?q=1'));
test('engine selection is honored', () => assert.equal(resolveInput('hello world','bing'), 'https://www.bing.com/search?q=hello%20world'));
test('unsafe schemes and empty searches are rejected', () => { for (const input of ['javascript:alert(1)','data:text/html,x','file:///tmp/x','   ']) assert.throws(() => resolveInput(input)); });
test('game routing distinguishes local files and remote sites', () => { assert.equal(gameTarget('/games/a.html','https://app.test').local,true); assert.equal(gameTarget('https://other.test/game','https://app.test').local,false); assert.throws(() => gameTarget('javascript:alert(1)','https://app.test')); });
