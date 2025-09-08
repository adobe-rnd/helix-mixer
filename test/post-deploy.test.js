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

import { h1NoCache } from '@adobe/fetch';
import assert from 'assert';
import { config } from 'dotenv';

config();

const providers = [
  {
    name: 'cloudflare',
    proddomain: 'aem.network',
    cidomain: 'cloudflareci.aem.network',
  },
  {
    name: 'fastly',
    // proddomain: 'aem.network', // not yet, activate when multi-cloud certs have been issued
    cidomain: 'fastlyci.aem.network',
  },
];

providers
  .map((env) => (process.env.TEST_PRODUCTION ? env.proddomain : env.cidomain))
  .filter((domain) => !!domain)
  .forEach((domain) => {
  /**
   * @param {string} path
   * @param {string} ref
   * @param {string} site
   * @param {string} owner
   * @returns {{url: URL} & RequestInit}
   */
    function getFetchOptions(path, ref, site, owner) {
      return {
        url: new URL(`https://${ref}--${site}--${owner}.${domain}${path}`),
        cache: 'no-store',
        redirect: 'manual',
      };
    }

    describe(`Post-Deploy Tests (${domain})`, () => {
      const fetchContext = h1NoCache();

      after(async () => {
        await fetchContext.reset();
      });

      it('returns 404 for invalid site', async () => {
        const { url, ...opts } = getFetchOptions('/missing', 'main', 'site', 'owner');
        const res = await fetch(url, opts);

        assert.strictEqual(res.status, 404, await res.text());
        assert.strictEqual(res.headers.get('x-error').substring(0, 21), 'Missing configuration');
      });

      it('returns 200 for Helix Homepage', async () => {
        const { url, ...opts } = getFetchOptions('/', 'main', 'helix-website', 'adobe');
        const res = await fetch(url, opts);

        assert.strictEqual(res.status, 200, await res.text());
      });
    });
  });
