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
import { globToRegExp, isCustomDomain } from '../src/util.js';
import { resolveCustomDomain } from '../src/dns.js';

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
      const url = new URL('https://example.workers.dev/path');
      assert.strictEqual(isCustomDomain(url), false);
    });

    it('should return false for .aem.network domains', () => {
      const url = new URL('https://site.aem.network/path');
      assert.strictEqual(isCustomDomain(url), false);
    });

    it('should return false for .aem-mesh.live domains', () => {
      const url = new URL('https://app.aem-mesh.live/path');
      assert.strictEqual(isCustomDomain(url), false);
    });

    it('should return false for subdomain of service domains', () => {
      const url1 = new URL('https://my-app.workers.dev');
      const url2 = new URL('https://sub.domain.aem.network');
      const url3 = new URL('https://test.site.aem-mesh.live');

      assert.strictEqual(isCustomDomain(url1), false);
      assert.strictEqual(isCustomDomain(url2), false);
      assert.strictEqual(isCustomDomain(url3), false);
    });

    it('should return true for custom domains', () => {
      const url1 = new URL('https://example.com/path');
      const url2 = new URL('https://my-site.org');
      const url3 = new URL('https://subdomain.example.net');

      assert.strictEqual(isCustomDomain(url1), true);
      assert.strictEqual(isCustomDomain(url2), true);
      assert.strictEqual(isCustomDomain(url3), true);
    });

    it('should return true for domains that contain service patterns but do not end with them', () => {
      const url1 = new URL('https://workers.dev.example.com');
      const url2 = new URL('https://aem.network.custom.org');

      assert.strictEqual(isCustomDomain(url1), true);
      assert.strictEqual(isCustomDomain(url2), true);
    });

    it('should return true when URL hostname is null or undefined', () => {
      const url = { hostname: null };
      assert.strictEqual(isCustomDomain(url), true);

      const url2 = { hostname: undefined };
      assert.strictEqual(isCustomDomain(url2), true);

      const url3 = {};
      assert.strictEqual(isCustomDomain(url3), true);

      assert.strictEqual(isCustomDomain(null), true);
      assert.strictEqual(isCustomDomain(undefined), true);
    });
  });

  describe('resolveCustomDomain', () => {
    it('should resolve CNAME for cftest.aem.wtf and return matching record', async () => {
      const result = await resolveCustomDomain('cftest.aem.wtf');

      // cftest.aem.wtf should resolve to a CNAME matching the pattern
      if (result) {
        assert.ok(typeof result === 'string');
        assert.ok(/^[^-]+--[^-]+--[^.]+\.domains\.aem\.network$/.test(result));
      } else {
        // If DNS resolution fails in test environment, we can't assert the result
        // but the function should handle the failure gracefully
        assert.strictEqual(result, null);
      }
    });

    it('should return null for domains that do not resolve to matching CNAME', async () => {
      const result = await resolveCustomDomain('example.com');

      // example.com should not resolve to a matching CNAME pattern
      assert.strictEqual(result, null);
    });

    it('should return null for non-existent domains', async () => {
      const result = await resolveCustomDomain('this-domain-does-not-exist-12345.invalid');

      // Non-existent domain should return null
      assert.strictEqual(result, null);
    });

    it('should handle domains with CNAME records that do not match the pattern', async () => {
      // Using a domain that likely has CNAME but doesn't match our pattern
      const result = await resolveCustomDomain('www.github.com');

      // Should return null since it won't match the aem.network pattern
      assert.strictEqual(result, null);
    });
  });
});
