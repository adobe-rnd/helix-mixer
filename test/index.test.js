/*
 * Copyright 2024 Adobe. All rights reserved.
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
import { main, makeContext } from '../src/index.js';

describe('index tests', () => {
  describe('makeContext', () => {
    it('creates context with proper structure for service domains', async () => {
      const mockRequest = new Request('https://app.workers.dev/path?param=value');
      const mockEnv = {
        CERT_TEST: 'test-cert',
        OTHER_VAR: 'value',
      };
      const mockEctx = {};

      const ctx = await makeContext(mockEctx, mockRequest, mockEnv);

      assert.strictEqual(ctx.url.host, 'app.workers.dev');
      assert.strictEqual(ctx.url.pathname, '/path');
      assert.strictEqual(ctx.url.searchParams.get('param'), 'value');
      assert.strictEqual(ctx.env, mockEnv);
      assert.strictEqual(ctx.executionContext, mockEctx);
      assert.deepStrictEqual(ctx.CERT, { TEST: 'test-cert' });
      assert.strictEqual(ctx.info.subdomain, 'app');
      assert.strictEqual(ctx.info.method, 'GET');
    });

    it('creates context for custom domains with DNS resolution attempt', async () => {
      const mockRequest = new Request('https://example.com/test');
      const mockEnv = {
        CERT_API_KEY: 'secret',
        REGULAR_VAR: 'normal',
      };
      const mockEctx = {};

      const ctx = await makeContext(mockEctx, mockRequest, mockEnv);

      assert.ok(ctx.url.hostname);
      assert.strictEqual(ctx.url.pathname, '/test');
      assert.strictEqual(ctx.env, mockEnv);
      assert.deepStrictEqual(ctx.CERT, { API_KEY: 'secret' });
      assert.strictEqual(ctx.info.subdomain, ctx.url.hostname.split('.')[0]);
    });

    it('processes request headers correctly', async () => {
      const mockRequest = new Request('https://test.workers.dev/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value',
        },
        body: 'test body',
      });
      const mockEnv = {};
      const mockEctx = {};

      const ctx = await makeContext(mockEctx, mockRequest, mockEnv);

      assert.strictEqual(ctx.info.method, 'POST');
      assert.strictEqual(ctx.info.headers['content-type'], 'application/json');
      assert.strictEqual(ctx.info.headers['x-custom-header'], 'test-value');
      assert.ok(ctx.info.body);
    });

    it('skips custom domain resolution for aem.network domains', async () => {
      const mockRequest = new Request('https://site.aem.network/path');
      const mockEnv = {};
      const mockEctx = {};

      const ctx = await makeContext(mockEctx, mockRequest, mockEnv);

      assert.strictEqual(ctx.url.host, 'site.aem.network');
      assert.strictEqual(ctx.info.subdomain, 'site');
    });

    it('skips custom domain resolution for aem-mesh.live domains', async () => {
      const mockRequest = new Request('https://app.aem-mesh.live/path');
      const mockEnv = {};
      const mockEctx = {};

      const ctx = await makeContext(mockEctx, mockRequest, mockEnv);

      assert.strictEqual(ctx.url.host, 'app.aem-mesh.live');
      assert.strictEqual(ctx.info.subdomain, 'app');
    });
  });

  describe('main', () => {
    it('handles ACME challenge requests directly', async () => {
      const token = 'test-token';
      const request = new Request(`https://example.com/.well-known/acme-challenge/${token}`);
      const context = {
        env: {
          LETSENCRYPT_ACCOUNT_THUMBPRINT: 'thumbprint',
        },
        log: {
          info: () => {},
          debug: () => {},
          error: () => {},
        },
      };

      const response = await main(request, context);
      const body = await response.text();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('content-type'), 'text/plain');
      assert.strictEqual(body, `${token}.thumbprint`);
    });
  });
});
