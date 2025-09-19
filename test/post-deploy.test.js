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

const name = process.env.POST_DEPLOY_SITE_NAME;

const prodPaths = {
  '/us/en_us/': { status: 200, contentType: 'text/html; charset=utf-8' },
  '/us/en_us': { status: 301, contentType: 'text/html; charset=utf-8', error: 'moved' },
  '/us/en_us/media_1a8779c3989180d2065225c3774102a6b6dd5cf51.avif': { status: 200, contentType: 'image/avif' },
  '/us/en_us/products/e310': { status: 200, contentType: 'text/html; charset=utf-8' },
  '/us/en_us/products/5200-standard-getting-started': { status: 200, contentType: 'text/html; charset=utf-8' },
  '/us/en_us/products/propel-series-510.json': { status: 200, contentType: 'application/json' },
};

prodPaths[`/us/en_us/why-${name}/videos/media_17c1cf041118656429876d13e3372de2f5527886f.mp4`] = { status: 200, contentType: 'video/mp4' };

const providers = [
  {
    name: 'cloudflare',
    proddomain: 'aem.network',
    cidomain: 'cloudflareci.aem-mesh.live',
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
      }).timeout(4000);

      it('returns 200 for Helix Homepage', async () => {
        const { url, ...opts } = getFetchOptions('/', 'main', 'helix-website', 'adobe');
        const res = await fetch(url, opts);

        assert.strictEqual(res.status, 200, await res.text());
      }).timeout(4000);

      Object.entries(prodPaths).forEach(([path, result]) => {
        it(`returns ${result.status} for ${path}`, async () => {
          const { url, ...opts } = getFetchOptions(path, 'main', name, 'aemsites');
          const res = await fetch(url, opts);

          assert.strictEqual(res.status, result.status, await res.text());
          assert.strictEqual(res.headers.get('content-type'), result.contentType);
          assert.strictEqual(res.headers.get('x-error'), result.error || null);
        }).timeout(4000);
      });
    });
  });
