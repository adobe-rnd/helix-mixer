/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// @ts-nocheck

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import inlineResources from '../src/inlines.js';
import { TEST_CONTEXT } from './util.js';

const originalFetch = globalThis.fetch;
let mockResponses = {};
function setupMockFetch() {
  globalThis.fetch = async (url) => {
    if (mockResponses[url.toString()]) {
      return mockResponses[url.toString()];
    }
    return new Response('Not Found', { status: 404 });
  };
}

const getFixture = (name, resource) => fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', `${name}.${resource}.html`), 'utf8');

describe('inlines tests', () => {
  beforeEach(() => {
    setupMockFetch();
  });

  afterEach(() => {
    mockResponses = {};
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return original response if not inline configured', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: false, inlineFooter: false } });
    const response = new Response('Hello, world!', { status: 200 });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    assert.strictEqual(result, response);
  });

  it('should return original response if not GET request', async () => {
    const ctx = TEST_CONTEXT({ info: { method: 'POST' }, config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    assert.strictEqual(result, response);
  });

  it('should return original response if not 200 response status', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 404, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    assert.strictEqual(result, response);
  });

  it('should return original response if not html content-type', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 200, headers: { 'content-type': 'application/json' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live/foo.json'), response);
    assert.strictEqual(result, response);
  });

  it('should return original response if not routed to an allowed origin', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://example.com'), response);
    assert.strictEqual(result, response);
  });

  it('should return original response if requested resource is .plain.html', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live/foo.plain.html'), response);
    assert.strictEqual(result, response);
  });

  it('should skip inlining if no header or footer tags exists in source document', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('Hello, world!', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, 'Hello, world!');
  });

  it('should skip inlining if no nav or footer meta tags exists in source document', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const response = new Response('<header></header>\n<footer></footer>', { status: 200, headers: { 'content-type': 'text/html' } });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, '<header></header>\n<footer></footer>');
  });

  it('should skip inlining if inline resource returns non-200 status', async () => {
    const ctx = TEST_CONTEXT({ config: { inlineNav: true, inlineFooter: true } });
    const initialBody = `\
<meta name="nav" content="/nav/nav">
<header></header>
<footer></footer>`;
    const response = new Response(initialBody, { status: 200, headers: { 'content-type': 'text/html' } });
    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response('Not Found', { status: 404 });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, initialBody); // unchanged
  });

  it('should inline fragment markers by replacing a simple wrapper', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response(`<div class="quiz-fragment">
  <p>Take the quiz</p>
</div>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(`<main>
  <p><a href="/fragments/homepage-quiz">https://main--demo--scdemos.aem.live/fragments/homepage-quiz</a></p>
</main>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, `<main>
  <div class="quiz-fragment">
    <p>Take the quiz</p>
  </div>
</main>`);
  });

  it('should inline fragment markers by replacing a simple div wrapper', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('<div class="quiz-fragment">Take the quiz</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(`<main>
  <div>
    <a href="/fragments/homepage-quiz">https://main--demo--scdemos.aem.live/fragments/homepage-quiz</a>
  </div>
</main>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, `<main>
  <div class="quiz-fragment">Take the quiz</div>
</main>`);
  });

  it('should inline fragment markers with anchor-only fallback when the parent has other content', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('<span class="quiz-fragment">Take the quiz</span>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p>Before <a href="/fragments/homepage-quiz">quiz</a> after</p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, '<p>Before <span class="quiz-fragment">Take the quiz</span> after</p>');
  });

  it('should keep surrounding section content when only the marker paragraph should be replaced', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response(`<div class="quiz-fragment">
  <p>Take the quiz</p>
</div>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(`<div>
  <h2>Take A Quiz</h2>
  <p><a href="/fragments/homepage-quiz">https://main--demo--scdemos.aem.live/fragments/homepage-quiz</a></p>
  <div class="section-metadata"><div><div>style</div><div>divider</div></div></div>
</div>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, `<div>
  <h2>Take A Quiz</h2>
  <div class="quiz-fragment">
    <p>Take the quiz</p>
  </div>
  <div class="section-metadata"><div><div>style</div><div>divider</div></div></div>
</div>`);
  });

  it('should not inline nav or footer when only fragment paths are configured', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        inlineNav: false,
        inlineFooter: false,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response('<nav>Should not inline</nav>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const initialBody = `<head>
  <meta name="nav" content="/nav/nav">
</head>
<body>
  <header></header>
</body>`;
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should support multiple inline path prefixes and normalize .plain.html with query strings', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/', '/blocks/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/blocks/promo.plain.html?variant=blue'] = new Response('<div class="promo-fragment">Promo</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p><a href="/blocks/promo?variant=blue#top">promo</a></p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, '<div class="promo-fragment">Promo</div>');
  });

  it('should skip fragment work when inlineFragments has no path prefixes and markup has no #inline', async () => {
    const localFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (...args) => {
      fetchCalls += 1;
      return localFetch.call(globalThis, ...args);
    };

    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: [] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/fragments/homepage-quiz">quiz</a></p>';
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(fetchCalls, 0);
    assert.strictEqual(body, initialBody);
  });

  it('should inline href ending with #inline when inlineFragments has no path prefixes', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: {},
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('<div class="quiz">Q</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p><a href="/fragments/homepage-quiz#inline">x</a></p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, '<div class="quiz">Q</div>');
  });

  it('should skip anchor scanning entirely when configured paths do not appear in the markup', async () => {
    const localFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (...args) => {
      fetchCalls += 1;
      return localFetch.call(globalThis, ...args);
    };

    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/not-fragments/homepage-quiz">quiz</a></p>';
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(fetchCalls, 0);
    assert.strictEqual(body, initialBody);
  });

  it('should not treat path prefixes as substring matches (e.g. /fragments/ vs /fragmentsfoo/)', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/fragmentsfoo/home">not a real fragment path</a></p>';
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should ignore protocol-relative and absolute hrefs for fragment detection', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="//other.example/fragments/x">a</a> <a href="https://main--helix-website--adobe.aem.live/fragments/y">b</a></p>';
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should ignore absolute fragment urls and plain-text urls in the body', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = `<p><a href="https://main--demo--scdemos.aem.live/fragments/homepage-quiz">https://main--demo--scdemos.aem.live/fragments/homepage-quiz</a></p>
<p>https://main--demo--scdemos.aem.live/fragments/whats-next</p>`;
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should dedupe identical fragment subrequests within one response', async () => {
    const localFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (...args) => {
      fetchCalls += 1;
      return localFetch.call(globalThis, ...args);
    };

    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('<div class="quiz-fragment">Take the quiz</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(`<main>
  <p><a href="/fragments/homepage-quiz">one</a></p>
  <p><a href="/fragments/homepage-quiz">two</a></p>
</main>`, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(fetchCalls, 1);
    assert.strictEqual(body, `<main>
  <div class="quiz-fragment">Take the quiz</div>
  <div class="quiz-fragment">Take the quiz</div>
</main>`);
  });

  it('should leave fragment markers unchanged when the fragment subrequest returns non-200', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/fragments/missing">quiz</a></p>';
    mockResponses['https://main--helix-website--adobe.aem.live/fragments/missing.plain.html'] = new Response('Not Found', { status: 404 });

    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should leave fragment markers unchanged when the fragment response is not html', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/fragments/homepage-quiz">quiz</a></p>';
    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });

    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });

  it('should merge cache keys from fragment subrequests', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/homepage-quiz.plain.html'] = new Response('<div class="quiz-fragment">Take the quiz</div>', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'frag1 frag2',
        'edge-cache-tag': 'ak1,ak2',
        'x-cache-tag': 'cfx1,cfx2',
      },
    });

    const response = new Response('<p><a href="/fragments/homepage-quiz">quiz</a></p>', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'root1',
        'edge-cache-tag': 'root-ak',
        'cache-tag': 'root-cf',
      },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    assert.strictEqual(result.headers.get('surrogate-key'), 'root1 frag1 frag2');
    assert.strictEqual(result.headers.get('edge-cache-tag'), 'root-ak,ak1,ak2');
    assert.strictEqual(result.headers.get('cache-tag'), 'root-cf,cfx1,cfx2');
    assert.strictEqual(result.headers.get('x-cache-tag'), 'root-cf,cfx1,cfx2');
  });

  it('should inline nav', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineNav: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response(getFixture('inline-nav', 'nav'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(getFixture('inline-nav', 'initial'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, getFixture('inline-nav', 'expected'));
  });

  it('should inline footer', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFooter: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/footer/footer.plain.html'] = new Response(getFixture('inline-footer', 'footer'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(getFixture('inline-footer', 'initial'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, getFixture('inline-footer', 'expected'));
  });

  it('should inline both, allows .plain.html suffix in meta', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineNav: true,
        inlineFooter: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response(getFixture('inline-both', 'nav'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/footer/footer.plain.html'] = new Response(getFixture('inline-both', 'footer'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response(getFixture('inline-both', 'initial'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, getFixture('inline-both', 'expected'));
  });

  it('should merge cache keys from original response and inline resources', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineNav: true,
        inlineFooter: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response(getFixture('inline-both', 'nav'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'foo sk1', // fastly
        'edge-cache-tag': 'bar,ect1', // akamai
        'cache-tag': 'baz,ec1', // cloudflare
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/footer/footer.plain.html'] = new Response(getFixture('inline-both', 'footer'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'sk1 sk2', // fastly
        'edge-cache-tag': 'ect1,ect2', // akamai
        'cache-tag': 'ec1,ec2', // cloudflare
      },
    });

    const response = new Response(getFixture('inline-both', 'initial'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'foo foo2', // fastly
        'edge-cache-tag': 'bar,bar2', // akamai
        'cache-tag': 'baz,baz2', // cloudflare
      },
    });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, getFixture('inline-both', 'expected'));
    assert.strictEqual(result.headers.get('surrogate-key'), 'foo foo2 sk1 sk2');
    assert.strictEqual(result.headers.get('edge-cache-tag'), 'bar,bar2,ect1,ect2');
    assert.strictEqual(result.headers.get('cache-tag'), 'baz,baz2,ec1,ec2');
  });

  it('should send push invalidation headers for fragment subrequests', async () => {
    const localFetch = globalThis.fetch;
    let fragmentFetchCount = 0;
    globalThis.fetch = async (...args) => {
      const [url, init] = args;
      if (String(url).includes('/fragments/push-test.plain.html')) {
        fragmentFetchCount += 1;
        assert.strictEqual(init.headers['accept-encoding'], 'identity');
        assert.strictEqual(init.headers['x-push-invalidation'], 'enabled');
        assert.strictEqual(init.headers['x-byo-cdn-type'], 'akamai');
      }
      return localFetch.call(globalThis, ...args);
    };

    const ctx = TEST_CONTEXT({
      info: {
        headers: {
          'x-byo-cdn-type': 'akamai',
          'x-push-invalidation': 'enabled',
        },
      },
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/fragments/push-test.plain.html'] = new Response('<div>ok</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p><a href="/fragments/push-test">x</a></p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    await result.text();
    assert.strictEqual(fragmentFetchCount, 1);
  });

  it('should send push invalidation headers for nav/footer subrequests', async () => {
    const localFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (...args) => {
      const [_, { headers }] = args;
      fetchCalls += 1;
      assert.strictEqual(headers['x-push-invalidation'], 'enabled');
      assert.strictEqual(headers['x-byo-cdn-type'], 'akamai');
      return localFetch.call(globalThis, ...args);
    };

    const ctx = TEST_CONTEXT({
      info: {
        headers: {
          'x-byo-cdn-type': 'akamai',
          'x-push-invalidation': 'enabled',
        },
      },
      config: {
        inlineNav: true,
        inlineFooter: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response(getFixture('inline-both', 'nav'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'foo sk1', // fastly
        'edge-cache-tag': 'bar,ect1', // akamai
        'cache-tag': 'baz,ec1', // cloudflare
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/footer/footer.plain.html'] = new Response(getFixture('inline-both', 'footer'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'sk1 sk2', // fastly
        'edge-cache-tag': 'ect1,ect2', // akamai
        'cache-tag': 'ec1,ec2', // cloudflare
      },
    });

    const response = new Response(getFixture('inline-both', 'initial'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'surrogate-key': 'foo foo2', // fastly
        'edge-cache-tag': 'bar,bar2', // akamai
        'cache-tag': 'baz,baz2', // cloudflare
      },
    });
    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(fetchCalls, 2);
    assert.strictEqual(body, getFixture('inline-both', 'expected'));
    assert.strictEqual(result.headers.get('surrogate-key'), 'foo foo2 sk1 sk2');
    assert.strictEqual(result.headers.get('edge-cache-tag'), 'bar,bar2,ect1,ect2');
    assert.strictEqual(result.headers.get('cache-tag'), 'baz,baz2,ec1,ec2');
  });

  it('should combine x-cache-tag from subresources into both cache-tag and x-cache-tag', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineNav: true,
        inlineFooter: true,
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    // Subresources only return x-cache-tag (no cache-tag)
    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response(getFixture('inline-both', 'nav'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'x-cache-tag': 'xn1,xn2',
      },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/footer/footer.plain.html'] = new Response(getFixture('inline-both', 'footer'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'x-cache-tag': 'xf1,xf2',
      },
    });

    // Initial response has no cache-tag/x-cache-tag
    const response = new Response(getFixture('inline-both', 'initial'), {
      status: 200,
      headers: {
        'content-type': 'text/html',
      },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(body, getFixture('inline-both', 'expected'));
    // Both headers should contain the union of x-cache-tag values from subresources
    assert.strictEqual(result.headers.get('x-cache-tag'), 'xn1,xn2,xf1,xf2');
    assert.strictEqual(result.headers.get('cache-tag'), 'xn1,xn2,xf1,xf2');
  });

  it('should inline a fragment via #inline hash even when its path is not in configured paths', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/promo/winter.plain.html'] = new Response('<div class="promo">Winter Sale</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p><a href="/promo/winter#inline">winter promo</a></p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, '<div class="promo">Winter Sale</div>');
  });

  it('should inline a fragment via #inline hash even when its path does not match any configured path', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/pathA', '/fragments/pathB'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/any/path.plain.html'] = new Response('<div class="anything">Content</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const response = new Response('<p><a href="/any/path#inline">content</a></p>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, '<div class="anything">Content</div>');
  });

  it('should inline both configured fragments and nav in one HTML document', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineNav: true,
        inlineFragments: { paths: ['/fragments/'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    mockResponses['https://main--helix-website--adobe.aem.live/nav/nav.plain.html'] = new Response('<nav>Inlined Nav</nav>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    mockResponses['https://main--helix-website--adobe.aem.live/fragments/banner.plain.html'] = new Response('<div class="banner">Banner</div>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const initial = `<head>
  <meta name="nav" content="/nav/nav">
</head>
<body>
  <header></header>
  <main><p><a href="/fragments/banner">fragment marker</a></p></main>
</body>`;

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), new Response(initial, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    const body = await result.text();
    assert.match(body, /<nav>Inlined Nav<\/nav>/);
    assert.match(body, /<div class="banner">Banner<\/div>/);
    assert.ok(!body.includes('<header></header>'));
    assert.ok(!body.includes('fragment marker'));
  });

  it('should not inline a fragment with #inline-section (not exact #inline hash)', async () => {
    const ctx = TEST_CONTEXT({
      config: {
        inlineFragments: { paths: ['/fragments/pathA', '/fragments/pathB'] },
        origin: 'main--helix-website--adobe.aem.live',
      },
    });

    const initialBody = '<p><a href="/path/page#inline-section">link</a></p>';
    const response = new Response(initialBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const result = await inlineResources(ctx, new URL('https://main--helix-website--adobe.aem.live'), response);
    const body = await result.text();
    assert.strictEqual(body, initialBody);
  });
});
