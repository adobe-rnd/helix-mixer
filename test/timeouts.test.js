/*
 * Copyright 2026 Adobe. All rights reserved.
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
import sinon from 'sinon';
import { main } from '../src/index.js';
import { resolveConfig } from '../src/config.js';
import handler from '../src/handler.js';
import inlineResources from '../src/inlines.js';
import { resolveCustomDomain } from '../src/dns.js';
import { ffetch, fetchWithTimeout, FetchTimeoutError } from '../src/util.js';
import {
  BACKEND_FETCH_TIMEOUT,
  CONFIG_FETCH_TIMEOUT,
  DNS_LOOKUP_TIMEOUT,
  INLINE_FETCH_TIMEOUT,
  REQUEST_DEADLINE,
  getTimeout,
  toHeaderValue,
} from '../src/timeouts.js';
import { TEST_CONTEXT } from './util.js';

const originalFetch = globalThis.fetch;

/**
 * A fetch that never responds, unless aborted through its signal.
 * Records each call's init so tests can check the signal.
 */
function stallingFetch(calls = []) {
  return (url, init) => new Promise((_, reject) => {
    calls.push({ url: url.toString(), init });
    init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
  });
}

function silentLog() {
  return {
    debug: () => {},
    info: () => {},
    warn: sinon.spy(),
    error: sinon.spy(),
  };
}

/** A response whose body never completes. */
function stalledBody(headers = {}) {
  return new Response(new ReadableStream({ start() {} }), { status: 200, headers });
}

/** A response whose body fails mid-stream. */
function brokenBody(headers = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html>'));
      controller.error(new TypeError('connection reset'));
    },
  }), { status: 200, headers });
}

function configResponse(mixerConfig) {
  return new Response(JSON.stringify({ public: { mixerConfig } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const MIXER_CONFIG = {
  patterns: { default: 'main' },
  backends: { main: { origin: 'backend.example' } },
};

describe('subrequest timeouts', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    sinon.stub(console, 'debug');
    sinon.stub(console, 'warn');
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
    globalThis.fetch = originalFetch;
  });

  describe('fetchWithTimeout', () => {
    it('resolves with the response when headers arrive in time', async () => {
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push(init);
        return new Response('ok');
      };
      const res = await fetchWithTimeout('https://upstream.example/', {}, 1000);
      assert.strictEqual(await res.text(), 'ok');
      // the timer was cleared: the signal is never aborted, so a streamed body stays intact
      await clock.tickAsync(5000);
      assert.strictEqual(calls[0].signal.aborted, false);
      assert.strictEqual(clock.countTimers(), 0);
    });

    it('rejects with a FetchTimeoutError and aborts the subrequest', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      const promise = fetchWithTimeout('https://upstream.example/', {}, 1000);
      const assertion = assert.rejects(promise, (e) => {
        assert.ok(e instanceof FetchTimeoutError);
        assert.strictEqual(e.timeout, 1000);
        return true;
      });
      await clock.tickAsync(1000);
      await assertion;
      assert.strictEqual(calls[0].init.signal.aborted, true);
    });

    it('times out without AbortController (Fastly Compute)', async () => {
      const { AbortController } = globalThis;
      delete globalThis.AbortController;
      try {
        const calls = [];
        globalThis.fetch = stallingFetch(calls);
        const promise = fetchWithTimeout('https://upstream.example/', { method: 'GET' }, 1000);
        const assertion = assert.rejects(promise, FetchTimeoutError);
        await clock.tickAsync(1000);
        await assertion;
        assert.deepStrictEqual(calls[0].init, { method: 'GET' });
      } finally {
        globalThis.AbortController = AbortController;
      }
    });

    it('passes network errors through', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('network connection lost');
      };
      await assert.rejects(fetchWithTimeout('https://upstream.example/', {}, 1000), /network connection lost/);
    });

    it('ffetch applies the timeout when given', async () => {
      globalThis.fetch = stallingFetch();
      const promise = ffetch('https://upstream.example/', {}, { timeout: 10 });
      const assertion = assert.rejects(promise, FetchTimeoutError);
      await clock.tickAsync(10);
      await assertion;
    });
  });

  describe('helpers', () => {
    it('getTimeout caps the timeout at the time left until the deadline', () => {
      assert.strictEqual(getTimeout({}, 15000), 15000);
      assert.strictEqual(getTimeout({ deadline: Date.now() + 60000 }, 15000), 15000);
      assert.strictEqual(getTimeout({ deadline: Date.now() + 4000 }, 15000), 4000);
      assert.strictEqual(getTimeout({ deadline: Date.now() - 1000 }, 15000), 0);
    });

    it('toHeaderValue strips non-printable characters and truncates', () => {
      assert.strictEqual(toHeaderValue('a\nb\u00e9c'), 'a b c');
      assert.strictEqual(toHeaderValue('x'.repeat(1000)).length, 256);
    });
  });

  describe('config fetch', () => {
    const configCtx = (overrides = {}) => TEST_CONTEXT({
      url: new URL('https://main--site--org.aem.network/path'),
      info: { subdomain: 'main--site--org' },
      env: { HLX_CONFIG_SERVICE_TOKEN: 'token' },
      log: silentLog(),
      requestId: 'req-1',
      ...overrides,
    });

    it('returns 502 on timeout', async () => {
      globalThis.fetch = stallingFetch();
      const ctx = configCtx();
      const promise = resolveConfig(ctx);
      const assertion = assert.rejects(promise, (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), `config fetch timeout (config.aem.page) after ${CONFIG_FETCH_TIMEOUT}ms`);
        assert.strictEqual(e.response.headers.get('cache-control'), 'private, no-store');
        return true;
      });
      await clock.tickAsync(CONFIG_FETCH_TIMEOUT);
      await assertion;
      const [logged] = ctx.log.error.firstCall.args;
      assert.match(logged, /config fetch timeout \(config\.aem\.page\) after 15000ms \(elapsed=15000ms, request=req-1\)/);
    });

    it('caps the timeout at the request deadline', async () => {
      globalThis.fetch = stallingFetch();
      const ctx = configCtx({ deadline: Date.now() + 2000 });
      const promise = resolveConfig(ctx);
      const assertion = assert.rejects(promise, (e) => {
        assert.strictEqual(e.response.headers.get('x-error'), 'config fetch timeout (config.aem.page) after 2000ms');
        return true;
      });
      await clock.tickAsync(2000);
      await assertion;
    });

    it('returns 502 on network error', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('network connection lost');
      };
      await assert.rejects(resolveConfig(configCtx()), (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), 'config fetch error (config.aem.page): network connection lost');
        return true;
      });
    });

    it('returns 502 on upstream 5xx', async () => {
      globalThis.fetch = async () => new Response('', { status: 500, headers: { 'x-error': 'boom' } });
      await assert.rejects(resolveConfig(configCtx()), (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), 'config fetch failed (config.aem.page): 500');
        assert.strictEqual(e.response.headers.get('cache-control'), 'private, no-store');
        return true;
      });
    });

    it('returns 502 when the body stalls after the headers', async () => {
      globalThis.fetch = async () => stalledBody({ 'content-type': 'application/json' });
      const promise = resolveConfig(configCtx());
      const assertion = assert.rejects(promise, (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), `config fetch timeout (config.aem.page) after ${CONFIG_FETCH_TIMEOUT}ms`);
        return true;
      });
      await clock.tickAsync(CONFIG_FETCH_TIMEOUT);
      await assertion;
    });

    it('returns 502 when the body fails', async () => {
      globalThis.fetch = async () => brokenBody({ 'content-type': 'application/json' });
      await assert.rejects(resolveConfig(configCtx()), (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), 'config fetch error (config.aem.page): connection reset');
        return true;
      });
    });

    it('keeps the upstream status for 4xx', async () => {
      globalThis.fetch = async () => new Response('', { status: 403 });
      await assert.rejects(resolveConfig(configCtx()), (e) => {
        assert.strictEqual(e.response.status, 403);
        assert.strictEqual(e.response.headers.get('cache-control'), null);
        assert.strictEqual(e.response.headers.get('x-error'), 'config fetch failed (config.aem.page): 403');
        return true;
      });
    });
  });

  describe('backend fetch', () => {
    const backendCtx = (overrides = {}) => TEST_CONTEXT({
      url: new URL('https://main--site--org.aem.network/path'),
      log: silentLog(),
      requestId: 'req-2',
      config: {
        protocol: 'https',
        origin: 'backend.example',
        pathname: '/path',
      },
      ...overrides,
    });

    it('returns 502 on timeout', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      const ctx = backendCtx();
      const promise = handler(ctx);
      const assertion = assert.rejects(promise, (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), `backend fetch timeout (backend.example) after ${BACKEND_FETCH_TIMEOUT}ms`);
        assert.strictEqual(e.response.headers.get('cache-control'), 'private, no-store');
        return true;
      });
      await clock.tickAsync(BACKEND_FETCH_TIMEOUT);
      await assertion;
      assert.strictEqual(calls[0].init.signal.aborted, true);
      assert.match(ctx.log.error.firstCall.args[0], /request=req-2/);
    });

    it('caps the timeout at the request deadline', async () => {
      globalThis.fetch = stallingFetch();
      const promise = handler(backendCtx({ deadline: Date.now() + 12000 }));
      const assertion = assert.rejects(promise, (e) => {
        assert.strictEqual(e.response.headers.get('x-error'), 'backend fetch timeout (backend.example) after 12000ms');
        return true;
      });
      await clock.tickAsync(12000);
      await assertion;
    });

    it('returns 502 on network error', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('connection reset\nby peer');
      };
      await assert.rejects(handler(backendCtx()), (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), 'backend fetch error (backend.example): connection reset by peer');
        return true;
      });
    });

    it('does not send the request when the deadline has passed', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      await assert.rejects(handler(backendCtx({ deadline: Date.now() - 1 })), (e) => {
        assert.strictEqual(e.response.status, 502);
        assert.strictEqual(e.response.headers.get('x-error'), 'backend fetch skipped (backend.example): request deadline exceeded');
        assert.strictEqual(e.response.headers.get('cache-control'), 'private, no-store');
        return true;
      });
      assert.strictEqual(calls.length, 0);
    });

    describe('when inlining (body is buffered)', () => {
      const ORIGIN = 'main--site--org.aem.live';
      const inliningCtx = (overrides) => backendCtx({
        config: {
          protocol: 'https',
          origin: ORIGIN,
          pathname: '/page',
          inlineFragments: { paths: ['/fragments/'] },
        },
        ...overrides,
      });

      it('returns 502 when the backend body stalls', async () => {
        globalThis.fetch = async () => stalledBody({ 'content-type': 'text/html' });
        const promise = handler(inliningCtx({ deadline: Date.now() + REQUEST_DEADLINE }));
        const assertion = assert.rejects(promise, (e) => {
          assert.strictEqual(e.response.status, 502);
          assert.strictEqual(e.response.headers.get('x-error'), `backend fetch timeout (${ORIGIN}) after ${BACKEND_FETCH_TIMEOUT}ms`);
          return true;
        });
        await clock.tickAsync(BACKEND_FETCH_TIMEOUT);
        await assertion;
      });

      it('returns 502 when the backend body fails', async () => {
        globalThis.fetch = async () => brokenBody({ 'content-type': 'text/html' });
        await assert.rejects(handler(inliningCtx()), (e) => {
          assert.strictEqual(e.response.status, 502);
          assert.strictEqual(e.response.headers.get('x-error'), `backend fetch error (${ORIGIN}): connection reset`);
          return true;
        });
      });
    });

    it('passes upstream 5xx responses through', async () => {
      globalThis.fetch = async () => new Response('unavailable', {
        status: 503,
        headers: { 'x-error': 'backend overloaded', 'retry-after': '5' },
      });
      const res = await handler(backendCtx());
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.headers.get('x-error'), 'backend overloaded');
      assert.strictEqual(res.headers.get('retry-after'), '5');
      assert.strictEqual(await res.text(), 'unavailable');
    });
  });

  describe('main', () => {
    const request = () => new Request('https://main--site--org.aem.network/path', {
      headers: { 'cf-ray': 'ray-1' },
    });
    const context = () => ({ env: { HLX_CONFIG_SERVICE_TOKEN: 'token' } });

    beforeEach(() => {
      sinon.stub(console, 'error');
    });

    it('returns 502 when the config fetch times out', async () => {
      globalThis.fetch = stallingFetch();
      const promise = main(request(), context());
      await clock.tickAsync(CONFIG_FETCH_TIMEOUT);
      const res = await promise;
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.headers.get('x-error'), 'config fetch timeout (config.aem.page) after 15000ms');
      assert.match(console.error.firstCall.args[0], /request=ray-1/);
    });

    it('limits the backend timeout to the time left after a slow config fetch', async () => {
      const slowConfig = 12000;
      globalThis.fetch = (url, init) => {
        if (new URL(url).host === 'config.aem.page') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(configResponse(MIXER_CONFIG)), slowConfig);
          });
        }
        return stallingFetch()(url, init);
      };
      const promise = main(request(), context());
      await clock.tickAsync(REQUEST_DEADLINE);
      const res = await promise;
      assert.strictEqual(res.status, 502);
      assert.strictEqual(
        res.headers.get('x-error'),
        `backend fetch timeout (backend.example) after ${REQUEST_DEADLINE - slowConfig}ms`,
      );
    });

    it('uses the request id from the edge adapter', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('network connection lost');
      };
      const res = await main(request(), { ...context(), invocation: { requestId: 'trace-1' } });
      assert.strictEqual(res.status, 502);
      assert.match(console.error.firstCall.args[0], /request=trace-1/);
    });

    it('bounds a pending env read by the request deadline', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      const promise = main(request(), { env: { HLX_CONFIG_SERVICE_TOKEN: new Promise(() => {}) } });
      await clock.tickAsync(REQUEST_DEADLINE);
      const res = await promise;
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.headers.get('x-error'), `env read timeout (HLX_CONFIG_SERVICE_TOKEN) after ${REQUEST_DEADLINE}ms`);
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
      assert.strictEqual(calls.length, 0);
    });

    it('returns 502 when an env read fails', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      const token = Promise.reject(new Error('gateway unavailable'));
      token.catch(() => {});
      const res = await main(request(), { env: { HLX_CONFIG_SERVICE_TOKEN: token } });
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.headers.get('x-error'), 'env read error (HLX_CONFIG_SERVICE_TOKEN): gateway unavailable');
      assert.strictEqual(calls.length, 0);
    });

    it('keeps 500 for errors in the mixer itself', async () => {
      globalThis.fetch = async () => configResponse(MIXER_CONFIG);
      const res = await main(request(), {
        env: {
          get HLX_CONFIG_SERVICE_TOKEN() {
            throw new Error('mixer bug');
          },
        },
      });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.headers.get('x-error'), 'internal server error');
    });
  });

  describe('inlines', () => {
    const ORIGIN = 'main--site--org.aem.live';
    const html = (body, headers = {}) => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html', ...headers },
    });
    const inlineCtx = (config, overrides = {}) => TEST_CONTEXT({
      log: silentLog(),
      requestId: 'req-3',
      config: { origin: ORIGIN, ...config },
      ...overrides,
    });

    const CACHEABLE = {
      'cache-control': 'max-age=300',
      'surrogate-control': 'max-age=86400',
      'cdn-cache-control': 'max-age=86400',
      'surrogate-key': 'page-key',
    };

    it('skips a fragment that times out and adds x-inline-error', async () => {
      globalThis.fetch = (url, init) => {
        if (url.toString().endsWith('/fragments/fast.plain.html')) {
          return Promise.resolve(html('<div>fast</div>', { 'surrogate-key': 'fast-key' }));
        }
        return stallingFetch()(url, init);
      };
      const ctx = inlineCtx({ inlineFragments: { paths: ['/fragments/'] } });
      const initial = '<p><a href="/fragments/slow">slow</a></p><p><a href="/fragments/fast">fast</a></p>';
      const promise = inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html(initial, CACHEABLE));
      await clock.tickAsync(INLINE_FETCH_TIMEOUT);
      const res = await promise;
      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.headers.get('x-inline-error'),
        `fragment fetch timeout (/fragments/slow) after ${INLINE_FETCH_TIMEOUT}ms`,
      );
      assert.strictEqual(await res.text(), '<p><a href="/fragments/slow">slow</a></p><div>fast</div>');
      // the page lacks the fragment and its cache keys: it must not be cached
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
      assert.strictEqual(res.headers.get('surrogate-control'), null);
      assert.strictEqual(res.headers.get('cdn-cache-control'), null);
      assert.strictEqual(res.headers.get('surrogate-key'), 'page-key fast-key');
      assert.match(ctx.log.warn.firstCall.args[0], /host=main--site--org\.aem\.live, elapsed=15000ms, request=req-3/);
    });

    it('keeps cache headers when all inlines succeed', async () => {
      globalThis.fetch = async () => html('<div>fast</div>');
      const ctx = inlineCtx({ inlineFragments: { paths: ['/fragments/'] } });
      const res = await inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html('<p><a href="/fragments/fast">fast</a></p>', CACHEABLE));
      assert.strictEqual(res.headers.get('x-inline-error'), null);
      assert.strictEqual(res.headers.get('cache-control'), 'max-age=300');
      assert.strictEqual(res.headers.get('surrogate-control'), 'max-age=86400');
      assert.strictEqual(res.headers.get('cdn-cache-control'), 'max-age=86400');
    });

    it('skips a fragment whose body stalls', async () => {
      globalThis.fetch = async () => stalledBody({ 'content-type': 'text/html' });
      const ctx = inlineCtx({ inlineFragments: { paths: ['/fragments/'] } });
      const promise = inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html('<p><a href="/fragments/slow">slow</a></p>'));
      await clock.tickAsync(INLINE_FETCH_TIMEOUT);
      const res = await promise;
      assert.strictEqual(res.headers.get('x-inline-error'), `fragment fetch timeout (/fragments/slow) after ${INLINE_FETCH_TIMEOUT}ms`);
      assert.strictEqual(await res.text(), '<p><a href="/fragments/slow">slow</a></p>');
    });

    it('does not fetch inlines once the deadline has passed', async () => {
      const calls = [];
      globalThis.fetch = stallingFetch(calls);
      const ctx = inlineCtx({ inlineNav: true }, { deadline: Date.now() - 1 });
      const initial = '<html><head><meta name="nav" content="/nav"></head><body><header></header></body></html>';
      const res = await inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html(initial, CACHEABLE));
      assert.strictEqual(calls.length, 0);
      assert.strictEqual(res.headers.get('x-inline-error'), 'header skipped (/nav): request deadline exceeded');
      assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
    });

    it('stops sequential header and footer fetches at the deadline', async () => {
      globalThis.fetch = stallingFetch();
      const ctx = inlineCtx(
        { inlineNav: true, inlineFooter: true },
        { deadline: Date.now() + 20000 },
      );
      const initial = '<html><head><meta name="nav" content="/nav"><meta name="footer" content="/footer"></head><body><header></header><footer></footer></body></html>';
      const promise = inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html(initial));
      await clock.tickAsync(20000);
      const res = await promise;
      assert.strictEqual(
        res.headers.get('x-inline-error'),
        'header fetch timeout (/nav) after 15000ms, footer fetch timeout (/footer) after 5000ms',
      );
    });

    it('caps inline timeouts at the request deadline', async () => {
      globalThis.fetch = stallingFetch();
      const ctx = inlineCtx(
        { inlineFragments: { paths: ['/fragments/'] } },
        { deadline: Date.now() + 3000 },
      );
      const promise = inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html('<p><a href="/fragments/slow">slow</a></p>'));
      await clock.tickAsync(3000);
      const res = await promise;
      assert.strictEqual(res.headers.get('x-inline-error'), 'fragment fetch timeout (/fragments/slow) after 3000ms');
    });

    it('skips header and footer on network error and adds x-inline-error', async () => {
      globalThis.fetch = async (url) => {
        if (url.toString().endsWith('/nav.plain.html')) {
          throw new TypeError('network connection lost');
        }
        return html('<div>footer</div>');
      };
      const ctx = inlineCtx({ inlineNav: true, inlineFooter: true });
      const initial = '<html><head><meta name="nav" content="/nav"><meta name="footer" content="/footer"></head><body><header></header><footer></footer></body></html>';
      const res = await inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html(initial));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-inline-error'), 'header fetch error (/nav): network connection lost');
      const body = await res.text();
      assert.ok(body.includes('<header></header>'));
      assert.ok(body.includes('<div>footer</div>'));
    });

    it('lists every failed inline in x-inline-error', async () => {
      globalThis.fetch = stallingFetch();
      const ctx = inlineCtx({ inlineNav: true, inlineFooter: true });
      const initial = '<html><head><meta name="nav" content="/nav"><meta name="footer" content="/footer"></head><body><header></header><footer></footer></body></html>';
      const promise = inlineResources(ctx, new URL(`https://${ORIGIN}/page`), html(initial));
      await clock.tickAsync(2 * INLINE_FETCH_TIMEOUT);
      const res = await promise;
      assert.strictEqual(
        res.headers.get('x-inline-error'),
        'header fetch timeout (/nav) after 15000ms, footer fetch timeout (/footer) after 15000ms',
      );
    });
  });

  describe('dns lookup', () => {
    it('returns null and logs on timeout', async () => {
      globalThis.fetch = stallingFetch();
      const promise = resolveCustomDomain('www.example.com', 'req-4');
      await clock.tickAsync(DNS_LOOKUP_TIMEOUT);
      assert.strictEqual(await promise, null);
      const logged = console.warn.getCalls().map((c) => c.args[0]);
      assert.ok(logged.includes(`dns lookup timeout (1.1.1.1) after ${DNS_LOOKUP_TIMEOUT}ms (elapsed=5000ms, request=req-4)`));
      assert.ok(logged.includes(`dns lookup timeout (dns.google) after ${DNS_LOOKUP_TIMEOUT}ms (elapsed=5000ms, request=req-4)`));
    });

    it('returns null when one provider fails and the other stalls on the body', async () => {
      globalThis.fetch = async (url) => {
        if (new URL(url).host === '1.1.1.1') {
          return new Response('', { status: 503 });
        }
        return stalledBody({ 'content-type': 'application/dns-message' });
      };
      const promise = resolveCustomDomain('www.example.com', 'req-5');
      await clock.tickAsync(DNS_LOOKUP_TIMEOUT);
      assert.strictEqual(await promise, null);
      const logged = console.warn.getCalls().map((c) => c.args[0]);
      assert.ok(logged.includes(`dns lookup timeout (dns.google) after ${DNS_LOOKUP_TIMEOUT}ms (elapsed=5000ms, request=req-5)`));
    });

    it('returns null and logs on network error', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('network connection lost');
      };
      assert.strictEqual(await resolveCustomDomain('www.example.com'), null);
      const logged = console.warn.getCalls().map((c) => c.args[0]);
      assert.ok(logged.includes('dns lookup error (dns.google): network connection lost (elapsed=0ms, request=-)'));
    });
  });
});
