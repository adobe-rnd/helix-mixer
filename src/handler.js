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
 * @typedef {import('@cloudflare/workers-types').Request} Request
 * @typedef {import('@cloudflare/workers-types').Response} Response
 * @typedef {import('@cloudflare/workers-types').Fetcher} Fetcher
 */

const BYO_CDN_TYPES = ['akamai', 'cloudflare', 'fastly', 'cloudfront'];

/**
 * @param {Context} ctx
 * @param {Request} req
 * @param {Response} beresp
 * @returns {Record<string, string>}
 */
function pipelineRespHeaders(ctx, req, beresp) {
  const { config } = ctx;

  let byoCdnType = req.headers.get('x-byo-cdn-type');
  const via = req.headers.get('via') || '';
  const cdnLoop = req.headers.get('cdn-loop') || '';
  // FIXME: cloudflare seems to strip the CDN-Loop header, i.e. the worker can't see it...
  if (!BYO_CDN_TYPES.includes(byoCdnType)) {
    // sniff downstream cdn type
    if (/[Aa]kamai/.test(via)) {
      byoCdnType = 'akamai';
    } else if (via.includes('varnish') || cdnLoop.startsWith('Fastly')) {
      byoCdnType = 'fastly';
    } else if (cdnLoop.includes('cloudflare') || req.headers.has('cf-worker')) {
      byoCdnType = 'cloudflare';
    } else if (via.includes('CloudFront')) {
      byoCdnType = 'cloudfront';
    } else {
      // invalid/unsupported CDN type
      byoCdnType = undefined;
    }
  }

  const headers = {
    'x-robots-tag': 'noindex, nofollow',
    'x-surrogate-key': undefined,
  };

  const cacheKeys = [...(beresp.headers.get('X-Surrogate-Key') || config.siteKey).split(/\s+/g)];
  if (cacheKeys.length) {
    switch (byoCdnType) {
      case 'fastly':
        headers['surrogate-key'] = cacheKeys.join(' ');
        break;
      case 'akamai':
        headers['edge-cache-tag'] = cacheKeys.join(' ');
        break;
      case 'cloudflare':
        headers['cache-tag'] = `${cacheKeys.join(',')},${config.siteKey}${ctx.url.pathname},${ctx.url.pathname}`;
        break;
      case 'cloudfront':
        // cloudfront doesn't support cache tags/keys ...
        break;
      default:
        break;
    }
  }
  return headers;
}

/**
 * @param {Context} ctx
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function handler(ctx, req) {
  const { config } = ctx;
  const { protocol, origin, pathname } = config;

  const beurl = new URL(
    `${pathname}${ctx.url.search}`,
    `${protocol}://${origin}`,
  );
  const isPipelineReq = beurl.origin === 'https://pipeline-cloudflare.adobecommerce.live';

  /** @type {Fetcher} */
  let impl;
  if (origin.endsWith('.magento.cloud')) {
    // @ts-ignore
    impl = ctx.CERT[config.siteKey];
    ctx.log.info(`${impl ? '' : 'not '}using mTLS fetcher for ${origin} (${config.siteKey})`);
  }
  ctx.log.debug('fetching: ', beurl);
  const beresp = await ffetch(impl)(beurl.toString(), {
    method: ctx.info.method,
    body: ctx.info.body,
    headers: {
      ...ctx.info.headers,
      ...(isPipelineReq ? {
        'x-auth-token': `token ${ctx.env.PRODUCT_PIPELINE_TOKEN}`,
      } : {}),
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  // @ts-ignore
  return new Response(beresp.body, {
    status: beresp.status,
    headers: {
      ...Object.fromEntries([...beresp.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
      ...(isPipelineReq
        ? pipelineRespHeaders(ctx, req, beresp)
        : {}),
    },
  });
}
