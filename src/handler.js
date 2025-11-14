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
import inlineResources from './inlines.js';

/**
 * @param {Context} ctx
 * @returns {Promise<import('@cloudflare/workers-types').Response>}
 */
export default async function handler(ctx) {
  const { config } = ctx;
  const { protocol, origin, pathname } = config;

  const beurl = new URL(
    `${pathname}${ctx.url.search}`,
    `${protocol}://${origin}`,
  );
  const isPipelineReq = beurl.origin === 'https://pipeline-cloudflare.adobecommerce.live';

  /** @type {import('@cloudflare/workers-types').Fetcher} */
  let impl;
  if (origin.endsWith('.magento.cloud')) {
    // @ts-ignore
    impl = ctx.CERT[config.siteKey];
    ctx.log.info(`${impl ? '' : 'not '}using mTLS fetcher for ${origin} (${config.siteKey})`);
  }
  ctx.log.debug('fetching: ', beurl);

  const fetchHeaders = {
    ...ctx.info.headers,
    // Always force gzip/deflate to prevent brotli cache poisoning.
    // Fastly's local cache doesn't include accept-encoding in the cache key, so if one request
    // caches a brotli response, subsequent requests could receive it even if they don't
    // request brotli. Since neither Fastly nor Cloudflare support brotli in DecompressionStream,
    // we must prevent brotli from ever being requested or cached.
    'accept-encoding': 'gzip, deflate',
    ...(isPipelineReq ? {
      'x-auth-token': `token ${ctx.env.PRODUCT_PIPELINE_TOKEN}`,
    } : {}),
  };

  ctx.log.debug('Fetching with headers:', fetchHeaders);

  let beresp = await ffetch(impl)(beurl.toString(), {
    method: ctx.info.method,
    body: ctx.info.body,
    redirect: 'manual',
    headers: fetchHeaders,
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  ctx.log.debug('Backend response headers:', {
    status: beresp.status,
    contentType: beresp.headers.get('content-type'),
    contentEncoding: beresp.headers.get('content-encoding'),
    cacheStatus: beresp.headers.get('cf-cache-status'),
  });

  beresp = await inlineResources(ctx, beurl, beresp);

  return new Response(beresp.body, {
    status: beresp.status,
    headers: {
      ...Object.fromEntries(beresp.headers.entries()),
      ...(isPipelineReq && !ctx.info.headers['x-forwarded-host'] ? {
        'x-robots-tag': 'noindex, nofollow',
      } : {}),
    },
  });
}
