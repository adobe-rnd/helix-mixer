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
});
