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

// @ts-nocheck

/**
 * @param {import('./types.d.ts').DeepPartial<Context>} overrides
 * @returns {Context}
 */
export const TEST_CONTEXT = (overrides = {}) => ({
  ...overrides,
  info: {
    method: 'GET',
    headers: {},
    subdomain: 'test',
    body: null,
    ...(overrides.info ?? {}),
  },
  config: {
    inlineNav: false,
    inlineFooter: false,
    patterns: {},
    backends: {},
    org: 'test',
    site: 'test',
    ref: 'test',
    siteKey: 'test--test--test',
    protocol: 'https',
    origin: 'test.com',
    pathname: '/test',
    ...(overrides.config ?? {}),
  },
  log: {
    ...console,
    ...(overrides.log ?? {}),
  },
  env: {
    ...(overrides.env ?? {}),
  },
  executionContext: {},
  attributes: {
    ...(overrides.attributes ?? {}),
  },
});
