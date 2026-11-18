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
import handler from '../src/handler.js';
import { TEST_CONTEXT } from './util.js';

describe('handler tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it('copies x-cache-tag into cache-tag when only x-cache-tag is present', async () => {
    const backendUrl = 'https://backend.example/internal';
    globalThis.fetch = async (url) => {
      assert.strictEqual(url.toString(), backendUrl);
      return new Response('ok', {
        status: 200,
        headers: {
          'x-cache-tag': 'tag-a,tag-b',
          'content-type': 'text/plain',
        },
      });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://service.example/some/path'),
      config: {
        protocol: 'https',
        origin: 'backend.example',
        pathname: '/internal',
        inlineNav: false,
        inlineFooter: false,
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-cache-tag'), 'tag-a,tag-b');
    assert.strictEqual(res.headers.get('cache-tag'), 'tag-a,tag-b');
  });

  it('forwards backend headers (from originOverrides) to the backend request', async () => {
    let sentInit;
    globalThis.fetch = async (_url, init) => {
      sentInit = init;
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://service.example/some/path'),
      config: {
        protocol: 'https',
        origin: 'backend.example',
        pathname: '/internal',
        inlineNav: false,
        inlineFooter: false,
        backend: {
          origin: 'backend.example',
          headers: { 'x-env': 'stage' },
        },
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(sentInit.headers['x-env'], 'stage');
  });

  it('forwards the original host as x-forwarded-host to the pipeline backend', async () => {
    let sentInit;
    globalThis.fetch = async (_url, init) => {
      sentInit = init;
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://main--site--org.aem.network/used/foo'),
      info: { headers: { host: 'main--site--org.aem.network' } },
      env: { PRODUCT_PIPELINE_TOKEN: Promise.resolve('tok') },
      config: {
        protocol: 'https',
        origin: 'pipeline-cloudflare.adobecommerce.live',
        pathname: '/used/foo',
        inlineNav: false,
        inlineFooter: false,
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(sentInit.headers['x-forwarded-host'], 'main--site--org.aem.network');
    assert.strictEqual(sentInit.headers['x-auth-token'], 'token tok');
  });

  it('preserves an existing x-forwarded-host to the pipeline backend', async () => {
    let sentInit;
    globalThis.fetch = async (_url, init) => {
      sentInit = init;
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://pipeline-cloudflare.adobecommerce.live/used/foo'),
      info: {
        headers: {
          host: 'pipeline-cloudflare.adobecommerce.live',
          'x-forwarded-host': 'www.example.com',
        },
      },
      env: { PRODUCT_PIPELINE_TOKEN: Promise.resolve('tok') },
      config: {
        protocol: 'https',
        origin: 'pipeline-cloudflare.adobecommerce.live',
        pathname: '/used/foo',
        inlineNav: false,
        inlineFooter: false,
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(sentInit.headers['x-forwarded-host'], 'www.example.com');
  });

  it('does not set x-forwarded-host for non-pipeline backends', async () => {
    let sentInit;
    globalThis.fetch = async (_url, init) => {
      sentInit = init;
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://service.example/some/path'),
      info: { headers: { host: 'service.example' } },
      config: {
        protocol: 'https',
        origin: 'backend.example',
        pathname: '/internal',
        inlineNav: false,
        inlineFooter: false,
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(sentInit.headers['x-forwarded-host'], undefined);
  });

  it('strips cf-cache-status header from backend response', async () => {
    const backendUrl = 'https://backend.example/internal';
    globalThis.fetch = async (url) => {
      assert.strictEqual(url.toString(), backendUrl);
      return new Response('ok', {
        status: 200,
        headers: {
          'cf-cache-status': 'HIT',
          'x-other': 'kept',
          'content-type': 'text/plain',
        },
      });
    };

    const ctx = TEST_CONTEXT({
      url: new URL('https://service.example/some/path'),
      config: {
        protocol: 'https',
        origin: 'backend.example',
        pathname: '/internal',
        inlineNav: false,
        inlineFooter: false,
      },
    });

    const res = await handler(ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cf-cache-status'), null);
    assert.strictEqual(res.headers.get('x-other'), 'kept');
  });
  describe('conditional requests for inlined pages', () => {
    const NAV_URL = 'https://main--site--org.aem.live/nav.plain.html';
    const OLD = 'Mon, 01 Jan 2024 00:00:00 GMT';
    const NEW = 'Wed, 10 Jan 2024 00:00:00 GMT';
    let sentHeaders;

    const stubBackend = ({
      lastModified = true, navLastModified = true, navError = false, navStatus = 200,
    } = {}) => {
      const lm = (date) => (lastModified ? { 'last-modified': date } : {});
      sentHeaders = undefined;
      globalThis.fetch = async (url, init) => {
        if (url.toString() === NAV_URL) {
          if (navError) {
            throw new TypeError('network down');
          }
          return new Response('<nav>new</nav>', {
            status: navStatus,
            headers: {
              'content-type': 'text/html',
              'cache-tag': 'nav-key',
              ...(navLastModified ? { 'last-modified': NEW } : {}),
            },
          });
        }
        sentHeaders = init.headers;
        if (Date.parse(init.headers['if-modified-since']) >= Date.parse(OLD)) {
          return new Response(null, { status: 304, headers: lm(OLD) });
        }
        return new Response('<meta name="nav" content="/nav">\n<header></header>', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            ...lm(OLD),
            'cache-control': 'max-age=7200',
            'cache-tag': 'page-key',
          },
        });
      };
    };

    const makeCtx = (headers, { pathname = '/page', inlineNav = true } = {}) => TEST_CONTEXT({
      url: new URL(`https://service.example${pathname}`),
      info: { headers },
      config: {
        protocol: 'https',
        origin: 'main--site--org.aem.live',
        pathname,
        inlineNav,
      },
    });

    it('removes conditional headers from the backend request', async () => {
      stubBackend();
      await handler(makeCtx({ 'if-modified-since': OLD, 'if-none-match': '"x"' }));
      assert.strictEqual(sentHeaders['if-modified-since'], undefined);
      assert.strictEqual(sentHeaders['if-none-match'], undefined);
    });

    ['/styles.css', '/footer.plain.html'].forEach((pathname) => {
      it(`forwards conditional headers for ${pathname}`, async () => {
        stubBackend();
        await handler(makeCtx({ 'if-modified-since': OLD, 'if-none-match': '"x"' }, { pathname }));
        assert.strictEqual(sentHeaders['if-modified-since'], OLD);
        assert.strictEqual(sentHeaders['if-none-match'], '"x"');
      });
    });

    it('forwards conditional headers when inlining is not configured', async () => {
      stubBackend();
      await handler(makeCtx({ 'if-modified-since': OLD }, { inlineNav: false }));
      assert.strictEqual(sentHeaders['if-modified-since'], OLD);
    });

    it('returns 304 when the merged page is not newer than if-modified-since', async () => {
      stubBackend();
      const res = await handler(makeCtx({ 'if-modified-since': NEW }));
      assert.strictEqual(res.status, 304);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(res.headers.get('last-modified'), NEW);
      assert.strictEqual(res.headers.get('cache-control'), 'max-age=7200');
      assert.deepStrictEqual(res.headers.get('cache-tag').split(',').sort(), ['nav-key', 'page-key']);
    });

    it('returns 200 when the inlined nav is newer than if-modified-since', async () => {
      stubBackend();
      const res = await handler(makeCtx({ 'if-modified-since': OLD }));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('last-modified'), NEW);
      assert.ok((await res.text()).includes('<nav>new</nav>'));
    });

    it('returns 200 when if-none-match is present', async () => {
      stubBackend();
      const res = await handler(makeCtx({ 'if-modified-since': NEW, 'if-none-match': '"x"' }));
      assert.strictEqual(res.status, 200);
    });

    it('returns 200 when an inline was skipped', async () => {
      stubBackend({ navError: true });
      const res = await handler(makeCtx({ 'if-modified-since': NEW }));
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('x-inline-error'));
    });

    it('returns 200 when the nav returns an HTTP error', async () => {
      stubBackend({ navStatus: 404 });
      const res = await handler(makeCtx({ 'if-modified-since': OLD }));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-inline-error'), null);
    });

    it('returns 200 when the nav has no last-modified', async () => {
      stubBackend({ navLastModified: false });
      const res = await handler(makeCtx({ 'if-modified-since': OLD }));
      assert.strictEqual(res.status, 200);
    });

    it('returns 304 without body encoding headers for a non-HTML response', async () => {
      globalThis.fetch = async () => new Response('{}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': '10',
          'last-modified': OLD,
        },
      });
      const res = await handler(makeCtx({ 'if-modified-since': NEW }));
      assert.strictEqual(res.status, 304);
      assert.strictEqual(res.headers.get('content-length'), null);
      assert.strictEqual(res.headers.get('content-encoding'), null);
      assert.strictEqual(res.headers.get('last-modified'), OLD);
    });

    it('returns 304 against the merged date when only fragments are inlined', async () => {
      globalThis.fetch = async (url) => {
        if (url.toString().endsWith('/fragments/promo.plain.html')) {
          return new Response('<p>promo</p>', {
            status: 200,
            headers: { 'content-type': 'text/html', 'last-modified': NEW },
          });
        }
        return new Response('<main>\n  <p><a href="/fragments/promo">promo</a></p>\n</main>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'last-modified': OLD },
        });
      };
      const makeFragmentCtx = (ims) => {
        const ctx = makeCtx({ 'if-modified-since': ims }, { inlineNav: false });
        ctx.config.inlineFragments = { paths: ['/fragments/'] };
        return ctx;
      };
      const notModified = await handler(makeFragmentCtx(NEW));
      assert.strictEqual(notModified.status, 304);
      assert.strictEqual(notModified.headers.get('last-modified'), NEW);
      const modified = await handler(makeFragmentCtx(OLD));
      assert.strictEqual(modified.status, 200);
    });

    it('returns 200 when a fragment returns an HTTP error', async () => {
      globalThis.fetch = async (url) => {
        if (url.toString().endsWith('/fragments/promo.plain.html')) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response('<main>\n  <p><a href="/fragments/promo">promo</a></p>\n</main>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'last-modified': OLD },
        });
      };
      const ctx = makeCtx({ 'if-modified-since': OLD }, { inlineNav: false });
      ctx.config.inlineFragments = { paths: ['/fragments/'] };
      const res = await handler(ctx);
      assert.strictEqual(res.status, 200);
    });

    ['not a date', '2099-01-01'].forEach((ims) => {
      it(`returns 200 for an invalid if-modified-since date (${ims})`, async () => {
        stubBackend();
        const res = await handler(makeCtx({ 'if-modified-since': ims }));
        assert.strictEqual(res.status, 200);
      });
    });

    it('returns 200 when the response has no last-modified', async () => {
      stubBackend({ lastModified: false });
      const ctx = makeCtx({ 'if-modified-since': NEW });
      const res = await handler(ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(ctx.attributes.inlineDateUnknown, undefined);
    });

    it('returns 304 with x-robots-tag for a pipeline page', async () => {
      globalThis.fetch = async (url) => {
        if (url.toString().endsWith('/nav.plain.html')) {
          return new Response('<nav>new</nav>', {
            status: 200,
            headers: { 'content-type': 'text/html', 'last-modified': NEW },
          });
        }
        return new Response('<meta name="nav" content="/nav">\n<header></header>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'last-modified': OLD },
        });
      };
      const ctx = makeCtx({ 'if-modified-since': NEW });
      ctx.config.origin = 'pipeline-cloudflare.adobecommerce.live';
      ctx.env.PRODUCT_PIPELINE_TOKEN = Promise.resolve('tok');
      const res = await handler(ctx);
      assert.strictEqual(res.status, 304);
      assert.strictEqual(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    });
  });
});
