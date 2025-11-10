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
});
