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
import { getEffectiveDomain, globToRegExp, isCustomDomain } from '../src/util.js';

describe('util tests', () => {
  describe('globToRegExp', () => {
    it('should convert a glob pattern to a regular expression', () => {
      const pattern = 'a*b/**';
      const re = globToRegExp(pattern);
      assert.ok(re instanceof RegExp);
      assert.ok(re.test('a123b/456'));
      assert.ok(re.test('a123b/456/789'));
      assert.ok(re.test('a123b/456/789/abc'));
      assert.ok(!re.test('a123b'));
      assert.ok(!re.test('/a123b/456'));
    });

    it('should convert a glob pattern to a regular expression with a leading slash', () => {
      const pattern = '/a*b/**';
      const re = globToRegExp(pattern);
      assert.ok(re instanceof RegExp);
      assert.ok(re.test('/a123b/456'));
      assert.ok(re.test('/a123b/456/789'));
      assert.ok(re.test('/a123b/456/789/abc'));
      assert.ok(!re.test('/a123b'));
    });

    it('should convert a glob pattern to a regular expression with a single asterisk', () => {
      const pattern = 'a/*';
      const re = globToRegExp(pattern);
      assert.ok(re instanceof RegExp);
      assert.ok(re.test('a/123'));
      assert.ok(!re.test('a/123/456'));
    });
  });

  describe('isCustomDomain', () => {
    it('should return false for .workers.dev domains', () => {
      const req = new Request('https://example.workers.dev/path');
      assert.strictEqual(isCustomDomain(new URL(req.url), req), false);
    });

    it('should return false for .aem.network domains', () => {
      const req = new Request('https://site.aem.network/path');
      assert.strictEqual(isCustomDomain(new URL(req.url), req), false);
    });

    it('should return false for .aem-mesh.live domains', () => {
      const req = new Request('https://app.aem-mesh.live/path');
      assert.strictEqual(isCustomDomain(new URL(req.url), req), false);
    });

    it('should return false for subdomain of service domains', () => {
      const req1 = new Request('https://my-app.workers.dev');
      const req2 = new Request('https://sub.domain.aem.network');
      const req3 = new Request('https://test.site.aem-mesh.live');

      assert.strictEqual(isCustomDomain(new URL(req1.url), req1), false);
      assert.strictEqual(isCustomDomain(new URL(req2.url), req2), false);
      assert.strictEqual(isCustomDomain(new URL(req3.url), req3), false);
    });

    it('should return true for custom domains', () => {
      const req1 = new Request('https://example.com/path');
      const req2 = new Request('https://my-site.org');
      const req3 = new Request('https://subdomain.example.net');

      assert.strictEqual(isCustomDomain(new URL(req1.url), req1), true);
      assert.strictEqual(isCustomDomain(new URL(req2.url), req2), true);
      assert.strictEqual(isCustomDomain(new URL(req3.url), req3), true);
    });

    it('should return true for domains that contain service patterns but do not end with them', () => {
      const req1 = new Request('https://workers.dev.example.com');
      const req2 = new Request('https://aem.network.custom.org');

      assert.strictEqual(isCustomDomain(new URL(req1.url), req1), true);
      assert.strictEqual(isCustomDomain(new URL(req2.url), req2), true);
    });

    it('should return true when URL hostname is null or undefined', () => {
      const req = new Request('https://example.com');

      // Test with URL-like objects cast to URL type for TypeScript
      /** @type {URL} */
      const url = /** @type {any} */({ hostname: null });
      assert.strictEqual(isCustomDomain(url, req), true);

      /** @type {URL} */
      const url2 = /** @type {any} */({ hostname: undefined });
      assert.strictEqual(isCustomDomain(url2, req), true);

      /** @type {URL} */
      const url3 = /** @type {any} */({});
      assert.strictEqual(isCustomDomain(url3, req), true);

      // Test with actual null and undefined
      assert.strictEqual(isCustomDomain(/** @type {any} */(null), req), true);
      assert.strictEqual(isCustomDomain(/** @type {any} */(undefined), req), true);
    });

    it('should handle CI domains with x-custom-domain header', () => {
      const ciUrl1 = new URL('https://test.fastlyci.aem.network');
      const ciUrl2 = new URL('https://test.cloudflareci.aem-mesh.live');

      // Without x-custom-domain header, CI domains are treated as service domains
      const reqWithoutHeader = new Request('https://test.fastlyci.aem.network');
      assert.strictEqual(isCustomDomain(ciUrl1, reqWithoutHeader), false);
      assert.strictEqual(isCustomDomain(ciUrl2, reqWithoutHeader), false);

      // With x-custom-domain header, CI domains are treated as custom domains
      const reqWithHeader = new Request('https://test.fastlyci.aem.network', {
        headers: { 'x-custom-domain': 'example.com' },
      });
      assert.strictEqual(isCustomDomain(ciUrl1, reqWithHeader), true);

      const reqWithHeader2 = new Request('https://test.cloudflareci.aem-mesh.live', {
        headers: { 'x-custom-domain': 'example.com' },
      });
      assert.strictEqual(isCustomDomain(ciUrl2, reqWithHeader2), true);
    });
  });

  describe('getEffectiveDomain', () => {
    it('should return host header for regular domains', () => {
      const req = new Request('https://example.com/path', {
        headers: { host: 'example.com' },
      });
      assert.strictEqual(getEffectiveDomain(req), 'example.com');
    });

    it('should return null when host header is missing for regular domains', () => {
      const req = new Request('https://example.com/path');
      assert.strictEqual(getEffectiveDomain(req), null);
    });

    it('should return host header for service domains', () => {
      const req1 = new Request('https://app.workers.dev', {
        headers: { host: 'app.workers.dev' },
      });
      assert.strictEqual(getEffectiveDomain(req1), 'app.workers.dev');

      const req2 = new Request('https://site.aem.network', {
        headers: { host: 'site.aem.network' },
      });
      assert.strictEqual(getEffectiveDomain(req2), 'site.aem.network');

      const req3 = new Request('https://test.aem-mesh.live', {
        headers: { host: 'test.aem-mesh.live' },
      });
      assert.strictEqual(getEffectiveDomain(req3), 'test.aem-mesh.live');
    });

    it('should return x-custom-domain for CI hosts when header is present', () => {
      const req1 = new Request('https://test.fastlyci.aem.network/path', {
        headers: {
          host: 'test.fastlyci.aem.network',
          'x-custom-domain': 'mycustomdomain.com',
        },
      });
      assert.strictEqual(getEffectiveDomain(req1), 'mycustomdomain.com');

      const req2 = new Request('https://app.cloudflareci.aem-mesh.live', {
        headers: {
          host: 'app.cloudflareci.aem-mesh.live',
          'x-custom-domain': 'anotherdomain.org',
        },
      });
      assert.strictEqual(getEffectiveDomain(req2), 'anotherdomain.org');
    });

    it('should return host header for CI hosts when x-custom-domain is missing', () => {
      const req1 = new Request('https://test.fastlyci.aem.network/path', {
        headers: { host: 'test.fastlyci.aem.network' },
      });
      assert.strictEqual(getEffectiveDomain(req1), 'test.fastlyci.aem.network');

      const req2 = new Request('https://app.cloudflareci.aem-mesh.live', {
        headers: { host: 'app.cloudflareci.aem-mesh.live' },
      });
      assert.strictEqual(getEffectiveDomain(req2), 'app.cloudflareci.aem-mesh.live');
    });

    it('should return null for CI hosts when both x-custom-domain and host headers are missing', () => {
      const req = new Request('https://test.fastlyci.aem.network/path');
      assert.strictEqual(getEffectiveDomain(req), null);
    });

    it('should handle host header with port', () => {
      const req = new Request('https://example.com:8080/path', {
        headers: { host: 'example.com:8080' },
      });
      assert.strictEqual(getEffectiveDomain(req), 'example.com:8080');
    });

    it('should handle CI host with port and x-custom-domain', () => {
      const req = new Request('https://test.fastlyci.aem.network:443/path', {
        headers: {
          host: 'test.fastlyci.aem.network:443',
          'x-custom-domain': 'custom.example.com',
        },
      });
      assert.strictEqual(getEffectiveDomain(req), 'custom.example.com');
    });
  });

  // dns tests moved to dns.test.js
});
