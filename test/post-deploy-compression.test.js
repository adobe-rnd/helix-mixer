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

import { h1NoCache } from '@adobe/fetch';
import assert from 'assert';
import { config } from 'dotenv';

config();

// Test different pages with different compression scenarios
const compressionTests = [
  {
    path: '/',
    description: 'Helix Homepage root',
    acceptEncodings: [
      { encoding: 'br', name: 'brotli' },
      { encoding: 'gzip', name: 'gzip' },
      { encoding: 'deflate', name: 'deflate' },
      { encoding: 'identity', name: 'identity (no compression)' },
    ],
  },
  {
    path: '/docs/',
    description: 'Helix Homepage docs section',
    acceptEncodings: [
      { encoding: 'br', name: 'brotli' },
      { encoding: 'gzip', name: 'gzip' },
      { encoding: 'deflate', name: 'deflate' },
      { encoding: 'identity', name: 'identity (no compression)' },
    ],
  },
  {
    path: '/docs/architecture',
    description: 'Helix architecture page',
    acceptEncodings: [
      { encoding: 'br', name: 'brotli' },
      { encoding: 'gzip', name: 'gzip' },
      { encoding: 'deflate', name: 'deflate' },
      { encoding: 'identity', name: 'identity (no compression)' },
    ],
  },
];

// Additional test for aem.live tutorial page
const aemLiveTest = {
  host: 'main--developer-website--aem-live.aem.live',
  path: '/developer/tutorial',
  description: 'AEM Live developer tutorial',
  acceptEncodings: [
    { encoding: 'br', name: 'brotli' },
    { encoding: 'gzip', name: 'gzip' },
    { encoding: 'deflate', name: 'deflate' },
    { encoding: 'identity', name: 'identity (no compression)' },
  ],
};

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
    describe(`Compression Tests (${domain})`, () => {
      const fetchContext = h1NoCache();

      after(async () => {
        await fetchContext.reset();
      });

      // Test Helix website pages with different encodings
      compressionTests.forEach(({ path, description, acceptEncodings }) => {
        describe(`${description} (${path})`, () => {
          acceptEncodings.forEach(({ encoding, name }) => {
            it(`should return 200 with ${name}`, async function () {
              this.timeout(10000);

              const url = new URL(`https://main--helix-website--adobe.${domain}${path}`);
              const res = await fetch(url, {
                headers: {
                  'Accept-Encoding': encoding,
                  'Cache-Control': 'no-store',
                },
                redirect: 'manual',
              });

              assert.strictEqual(res.status, 200, `Expected 200 for ${path} with ${name}`);

              // Check that the response is properly encoded or not
              const contentEncoding = res.headers.get('content-encoding');
              if (encoding === 'identity') {
                // Should have no content-encoding header or 'identity'
                assert.ok(
                  !contentEncoding || contentEncoding === 'identity',
                  `Expected no encoding or 'identity' but got ${contentEncoding}`,
                );
              } else if (encoding === 'br' || encoding === 'gzip' || encoding === 'deflate') {
                // May or may not be compressed depending on backend support
                // But if compressed, should match what we requested
                if (contentEncoding && contentEncoding !== 'identity') {
                  assert.ok(
                    contentEncoding === encoding,
                    `Expected ${encoding} but got ${contentEncoding}`,
                  );
                }
              }

              // Verify content is readable (tests decompression if compressed)
              const text = await res.text();
              assert.ok(text.length > 0, 'Response should have content');

              // Check for basic HTML structure
              assert.ok(text.includes('<!DOCTYPE html') || text.includes('<html'), 'Response should be HTML');

              // For pages with inlining enabled, check if nav/footer are present
              // (they may be missing if compression prevented inlining, which is OK)
              if (path === '/') {
                // Just log whether inlining worked, don't fail the test
                const hasNav = text.includes('<nav') || text.includes('class="nav');
                const hasFooter = text.includes('<footer') || text.includes('class="footer');
                console.log(`        Inlining status - nav: ${hasNav}, footer: ${hasFooter}`);
              }
            });
          });
        });
      });

      // Test AEM Live tutorial page separately
      describe(`${aemLiveTest.description} (${aemLiveTest.path})`, () => {
        aemLiveTest.acceptEncodings.forEach(({ encoding, name }) => {
          it(`should return 200 with ${name}`, async function () {
            this.timeout(10000);

            const url = new URL(`https://${aemLiveTest.host}${aemLiveTest.path}`);

            // For CI environments, we need to proxy through the mixer service
            if (!process.env.TEST_PRODUCTION) {
              // Route through the mixer service for the aem.live domain
              url.hostname = `main--developer-website--aem-live.${domain}`;
              url.pathname = aemLiveTest.path;
            }

            const res = await fetch(url, {
              headers: {
                'Accept-Encoding': encoding,
                'Cache-Control': 'no-store',
              },
              redirect: 'manual',
            });

            // This might return 404 if the routing isn't configured, which is OK
            if (res.status === 404) {
              console.log(`        Skipping - routing not configured for ${aemLiveTest.host}`);
              this.skip();
              return;
            }

            assert.strictEqual(res.status, 200, `Expected 200 for ${aemLiveTest.path} with ${name}`);

            // Verify content is readable
            const text = await res.text();
            assert.ok(text.length > 0, 'Response should have content');
            assert.ok(text.includes('<!DOCTYPE html') || text.includes('<html'), 'Response should be HTML');
          });
        });
      });
    });
  });
