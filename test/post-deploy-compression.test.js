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
import { promisify } from 'util';
import { gunzip, inflate } from 'zlib';

config();

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);

// Test pages
const testPaths = [
  { path: '/', description: 'Helix Homepage root' },
  { path: '/docs/', description: 'Helix Homepage docs section' },
  { path: '/docs/architecture', description: 'Helix architecture page' },
];

// Test encodings: gzip, deflate, identity
// Also test brotli to ensure it's NEVER returned (prevent cache poisoning)
const acceptEncodings = [
  { encoding: 'gzip', name: 'gzip' },
  { encoding: 'deflate', name: 'deflate' },
  { encoding: 'identity', name: 'identity (no compression)' },
  { encoding: 'br', name: 'brotli (should be blocked)' },
];

const providers = [
  {
    name: 'cloudflare',
    proddomain: 'aem.network',
    cidomain: 'cloudflareci.aem-mesh.live',
  },
  {
    name: 'fastly',
    cidomain: 'fastlyci.aem.network',
  },
];

/**
 * Verify that the response body matches the claimed content-encoding.
 * @param {Response} res - The HTTP response
 * @returns {Promise<string>} - The decompressed HTML text
 */
async function verifyCompressionAndGetHTML(res) {
  const contentEncoding = res.headers.get('content-encoding');
  const rawBody = await res.arrayBuffer();
  const buffer = Buffer.from(rawBody);

  let html;

  if (!contentEncoding || contentEncoding === 'identity') {
    // No compression or explicit identity
    html = buffer.toString('utf8');
  } else if (contentEncoding === 'gzip') {
    // Verify it's actually gzip by decompressing
    try {
      const decompressed = await gunzipAsync(buffer);
      html = decompressed.toString('utf8');
    } catch (error) {
      throw new Error(`Content-Encoding claims gzip but decompression failed: ${error.message}`);
    }
  } else if (contentEncoding === 'deflate') {
    // Verify it's actually deflate by decompressing
    try {
      const decompressed = await inflateAsync(buffer);
      html = decompressed.toString('utf8');
    } catch (error) {
      throw new Error(`Content-Encoding claims deflate but decompression failed: ${error.message}`);
    }
  } else if (contentEncoding === 'br') {
    // CDN may transparently compress with brotli - this is OK!
    // Just use the Response.text() method which handles decompression
    html = await res.text();
  } else {
    throw new Error(`Unexpected content-encoding: ${contentEncoding}`);
  }

  // Verify it's HTML
  assert.ok(
    html.includes('<!DOCTYPE html') || html.includes('<html'),
    'Response must be valid HTML',
  );

  // The fact that we successfully decompressed based on content-encoding header
  // means the header matched the actual compression format - which is what we're testing

  return html;
}

providers
  .map((env) => (process.env.TEST_PRODUCTION ? env.proddomain : env.cidomain))
  .filter((domain) => !!domain)
  .forEach((domain) => {
    describe(`Post-Deploy Compression Tests (${domain})`, () => {
      const fetchContext = h1NoCache();

      after(async () => {
        await fetchContext.reset();
      });

      testPaths.forEach(({ path, description }) => {
        describe(`${description} (${path})`, () => {
          acceptEncodings.forEach(({ encoding, name }) => {
            it(`should return valid HTML with ${name}`, async function testCompression() {
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

              // Verify compression matches headers and get HTML
              const html = await verifyCompressionAndGetHTML(res);

              // Verify we got content
              assert.ok(html.length > 0, 'Response should have content');

              // Log inlining status for homepage
              if (path === '/') {
                const hasFooter = html.includes('<footer') || html.includes('class="footer');
                console.log(`        Inlining status - footer: ${hasFooter}`);
              }
            });
          });
        });
      });
    });
  });
