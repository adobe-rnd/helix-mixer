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

import { ffetch } from './util.js';

/**
 * @param {Context} ctx
 * @returns {Promise<import('@cloudflare/workers-types').Response>}
 */
export default async function handler(ctx) {
  const { config } = ctx;
  const { origin, pathname } = config;

  const beurl = new URL(
    `${pathname}${ctx.url.search}`,
    `${/^https?:\/\//.test(origin) ? origin : `https://${origin}`}`,
  ).toString();

  /** @type {import('@cloudflare/workers-types').Fetcher} */
  let impl;
  if (origin.endsWith('.magento.cloud')) {
    ctx.log.debug('using mTLS fetcher');
    // @ts-ignore
    impl = ctx.CERT[config.siteKey];
    if (!impl) {
      ctx.log.warn(`missing mTLS fetcher for ${origin} (${config.siteKey})`);
    }
  }
  ctx.log.debug('fetching: ', beurl);
  const beresp = await ffetch(impl)(beurl, {
    headers: ctx.info.headers,
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  ctx.log.debug('beresp headers: ', Object.fromEntries(beresp.headers.entries()));
  return new Response(beresp.body, {
    status: beresp.status,
    headers: {
      ...Object.fromEntries(beresp.headers.entries()),
      ...(beurl.includes('pipeline-cloudflare.adobecommerce.live') ? { 'x-robots-tag': 'noindex, nofollow' } : {}),
    },
  });
}
