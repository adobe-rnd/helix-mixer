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
import { acmeChallenge } from '../src/acme.js';

describe('acme tests', () => {
  it('returns response with token and thumbprint', async () => {
    const token = 'sample-token';
    const request = new Request(`https://example.com/.well-known/acme-challenge/${token}`);
    const context = {
      env: {
        LETSENCRYPT_ACCOUNT_THUMBPRINT: 'thumbprint-value',
      },
    };

    const response = await acmeChallenge(request, context);
    const body = await response.text();
    const [tokenPart, thumbprint] = body.split('.');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'text/plain');
    assert.strictEqual(tokenPart, token);
    assert.ok(thumbprint); // ensure thumbprint not empty
  });

  it('awaits thumbprint value from env bindings', async () => {
    const token = 'await-token';
    const request = new Request(`https://example.com/.well-known/acme-challenge/${token}`);
    const thumbprintPromise = Promise.resolve('resolved-thumbprint');
    const context = {
      env: {
        LETSENCRYPT_ACCOUNT_THUMBPRINT: thumbprintPromise,
      },
    };

    const response = await acmeChallenge(request, context);
    const body = await response.text();

    assert.strictEqual(body, `${token}.resolved-thumbprint`);
  });
});
