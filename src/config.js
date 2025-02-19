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

import { errorWithResponse, ffetch, globToRegExp } from './util.js';

/** @type {'CONFIG_SERVICE' | 'STORAGE'} */
const SOURCE = 'CONFIG_SERVICE';

/**
 * @param {string[]} patterns - An array of pattern strings to match against.
 * @param {string} path - The path string to match patterns against.
 */
function findGlobMatch(patterns, path) {
  return patterns
    .sort((a, b) => b.length - a.length)
    .map((pattern) => {
      const re = globToRegExp(pattern);
      return re.test(path) ? pattern : null;
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
  const { log } = ctx;

  log.debug('headers: ', ctx.info.headers, ctx.info.headers.referer);
  let ref;
  let site;
  let org;
  if (ctx.env.DEV === 'true') {
    ref = ctx.env.REF;
    site = ctx.env.SITE;
    org = ctx.env.ORG;
  } else {
    ([ref, site, org] = ctx.info.subdomain.split('--'));
  }
  log.debug('rso: ', ref, site, org, ctx.env.DEV);
  if (!org) {
    throw errorWithResponse(404, 'missing org');
  }
  if (!site) {
    throw errorWithResponse(404, 'missing site');
  }
  log.debug(`org=${org} site=${site} pathname=${ctx.url.pathname}`);

  const siteKey = `${ref}--${site}--${org}`;

  /**
   * @type {RawConfig}
   */
  let rawConfig;
  if (SOURCE === 'STORAGE') {
    rawConfig = await ctx.storage.get(siteKey, 'json');
  } else {
    const res = await ffetch()(`https://${siteKey}.aem.page/config.json`);
    if (!res.ok) {
      if (res.status === 404) {
        throw errorWithResponse(404, 'config not found');
      }
      throw errorWithResponse(500, 'config fetch failed');
    }
    const json = await res.json();
    rawConfig = json.public?.mixerConfig;
  }

  if (!rawConfig) {
    return null;
  }

  // simple validation to ensure the config matches required schema
  try {
    if (typeof rawConfig !== 'object' || !rawConfig.patterns || !rawConfig.backends) {
      throw new Error('invalid config object');
    }

    const { patterns, backends } = rawConfig;
    if (!patterns || Object.values(patterns).some((p) => typeof p !== 'string')) {
      throw new Error('invalid pattern, expected type string');
    }
    if (!backends || Object.values(backends).some((b) => typeof b.origin !== 'string')) {
      throw new Error('invalid backend, expected type string');
    }
  } catch (e) {
    throw errorWithResponse(400, e.message);
  }

  const { patterns, backends } = rawConfig;
  const pattern = findGlobMatch(
    Object.keys(patterns).filter((p) => p !== 'default'),
    ctx.url.pathname,
  );

  const backendKey = patterns[pattern] ?? 'default';
  if (!backends[backendKey]) {
    throw errorWithResponse(400, `backend not found: ${backendKey}`);
  }

  log.debug(`pattern=${pattern} origin=${backends[backendKey].origin}`);

  /** @type {Config} */
  const resolved = {
    org,
    site,
    ref,
    siteKey,
    pathname: ctx.url.pathname,
    pattern,
    backend: backends[backendKey],
    origin: backends[backendKey].origin,
    ...rawConfig,
    ...overrides,
  };

  return resolved;
}
