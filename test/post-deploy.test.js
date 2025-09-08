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

import assert from 'assert';
import { h1NoCache } from '@adobe/fetch';
import { config } from 'dotenv';

config();

const providers = [
  {
    name: 'cloudflare',
    proddomain: process.env.HLX_CLOUDFLARE_PROD_DOMAIN || 'helix-mixer.workers.dev',
    cidomain: process.env.HLX_CLOUDFLARE_CI_DOMAIN || 'helix-mixer-ci.adobeaem.workers.dev',
  },
  {
    name: 'fastly',
    proddomain: process.env.HLX_FASTLY_PROD_DOMAIN || 'helix-mixer.edgecompute.app',
    cidomain: process.env.HLX_FASTLY_CI_DOMAIN || 'helix-mixer-ci.edgecompute.app',
  },
];

providers.forEach((env) => {
  const domain = process.env.CI ? env.cidomain : env.proddomain;

  /**
   * @param {string} path
   * @returns {{url: URL} & RequestInit}
   */
  function getFetchOptions(path) {
    return {
      url: new URL(`https://${domain}${path}`),
      cache: 'no-store',
      redirect: 'manual',
    };
  }

  describe(`Post-Deploy Tests (${env.name})`, () => {
    const fetchContext = h1NoCache();

    after(async () => {
      await fetchContext.reset();
    });

    it('returns 404 for missing site param', async function test() {
      if (!process.env.TEST_INTEGRATION) {
        this.skip();
      }
      const { url, ...opts } = getFetchOptions('/missing');
      const res = await fetch(url, opts);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.headers.get('x-error'), 'missing org');
    });
  });
});
