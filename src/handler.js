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
import inlineResources, { inlineConfigured } from './inlines.js';

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
  let beresp = await ffetch(impl)(beurl.toString(), {
    method: ctx.info.method,
    body: ctx.info.body,
    redirect: 'manual',
    headers: {
      ...ctx.info.headers,
      // TODO: handle brotli for inlined resources
      // eslint-disable-next-line max-len
      'accept-encoding': inlineConfigured(ctx) && ctx.info.headers['accept-encoding']?.includes('br')
        ? ctx.info.headers['accept-encoding'].replace('br', '')
        : ctx.info.headers['accept-encoding'],
      ...(isPipelineReq ? {
        'x-auth-token': `token ${ctx.env.PRODUCT_PIPELINE_TOKEN}`,
      } : {}),
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
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
