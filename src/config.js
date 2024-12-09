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

import { errorWithResponse } from './util.js';

/**
 * @param {string[]} patterns - An array of pattern strings to match against.
 * @param {string} path - The path string to match patterns against.
 */
function findGlobMatch(patterns, path) {
  return patterns
    .sort((a, b) => b.length - a.length)
    .map((pattern) => {
      const re = new RegExp(`^${pattern.replace(/\*/g, '([^/]+)').replace('/**/', '(.*)')}$`);
      const match = path.match(re);
      return match ? pattern : null;
    })
    .filter(Boolean)[0];
}

/**
 * This function resolves the configuration for a given context and overrides.
 * @param {Context} ctx - The context object.
 * @param {Partial<Config>} [overrides={}] - The overrides object.
 * @returns {Promise<Config|null>} - A promise that resolves to the configuration.
 */
export async function resolveConfig(ctx, overrides = {}) {
  const [_, org, site, ...rest] = ctx.url.pathname.split('/');
  if (!org) {
    throw errorWithResponse(404, 'missing org');
  }
  if (!site) {
    throw errorWithResponse(404, 'missing site');
  }

  const siteKey = `${org}--${site}`;

  /**
   * @type {ConfigMap}
   */
  const confMap = await ctx.env.CONFIGS.get(siteKey, 'json');
  if (!confMap) {
    return null;
  }
  if (typeof confMap !== 'object') {
    ctx.log.warn('invalid config for ', siteKey);
    return null;
  }

  // order paths by preference
  const suffix = `/${rest.join('/')}`;
  const key = findGlobMatch(
    Object.keys(confMap).filter((p) => p !== 'default'),
    suffix,
  ) ?? 'default';

  const resolved = {
    org,
    site,
    siteKey,
    pathname: suffix,
    ...confMap[key],
    ...overrides,
  };

  return resolved;
}
