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
import { globToRegExp } from '../src/util.js';

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
});
