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

import { redactHeaders } from './util.js';
import { BACKEND_FETCH_TIMEOUT, fetchUpstream, readEnv } from './timeouts.js';
import inlineResources, { canInline } from './inlines.js';

const CONDITIONAL_HEADERS = ['if-modified-since', 'if-none-match'];

/**
 * Whether the merged page is unchanged since the client's `If-Modified-Since`.
 * The client's `If-None-Match` can't be checked, because the merged page has no ETag of its own.
 * An inline that was skipped or had no valid date leaves the merged `last-modified` untrustworthy.
 * @param {Context} ctx
 * @param {Headers} headers
 * @param {number} status
 * @returns {boolean}
 */
function notModified(ctx, headers, status) {
  const reqHeaders = ctx.info.headers;
  const ims = reqHeaders['if-modified-since'];
  if (status !== 200 || !ims) {
    return false;
  }
  if (reqHeaders['if-none-match'] || ctx.attributes.inlineDateUnknown) {
    ctx.log.debug('Not answering 304 for merged page:', {
      ifNoneMatch: !!reqHeaders['if-none-match'],
      inlineDateUnknown: !!ctx.attributes.inlineDateUnknown,
    });
    return false;
  }
  const since = Date.parse(ims);
  // only accept IMF-fixdate; other parseable strings are not valid HTTP-dates and must be ignored
  if (Number.isNaN(since) || new Date(since).toUTCString() !== ims) {
    return false;
  }
  const lastModified = Date.parse(headers.get('last-modified'));
  return lastModified <= since;
}

/**
 * @param {Context} ctx
 * @returns {Promise<import('@cloudflare/workers-types').Response>}
 */
export default async function handler(ctx) {
  const { config } = ctx;
  const {
    protocol, origin, pathname, backend,
  } = config;

  const beurl = new URL(
    `${pathname}${ctx.url.search}`,
    `${protocol}://${origin}`,
  );
  const isPipelineReq = beurl.origin === 'https://pipeline-cloudflare.adobecommerce.live';

  ctx.log.debug('fetching: ', beurl);

  const productPipelineToken = isPipelineReq ? await readEnv(ctx, 'PRODUCT_PIPELINE_TOKEN') : undefined;
  const fetchHeaders = {
    ...ctx.info.headers,
    // Always force gzip/deflate to prevent brotli cache poisoning.
    // Fastly's local cache doesn't include accept-encoding in the cache key, so if one request
    // caches a brotli response, subsequent requests could receive it even if they don't
    // request brotli. Since neither Fastly nor Cloudflare support brotli in DecompressionStream,
    // we must prevent brotli from ever being requested or cached.
    'accept-encoding': 'gzip, deflate',
    ...(isPipelineReq ? {
      'x-auth-token': `token ${productPipelineToken}`,
      'x-forwarded-host': ctx.info.headers['x-forwarded-host'] || ctx.info.headers.host,
    } : {}),
    // backend-specific headers (incl. any resolved from originOverrides) win last
    ...(backend?.headers ?? {}),
  };

  // The backend would compare the client's validators with the page alone and could answer 304
  // even though the inlined nav/footer changed, so the merged page is checked after inlining.
  const checkConditional = canInline(ctx, beurl);
  if (checkConditional) {
    CONDITIONAL_HEADERS.forEach((name) => delete fetchHeaders[name]);
  }

  ctx.log.debug('Fetching with headers:', redactHeaders(fetchHeaders));

  // timeouts and network errors become a 502; upstream responses (incl. 5xx) pass through
  let beresp = await fetchUpstream(ctx, {
    stage: 'backend',
    url: beurl.toString(),
    init: {
      method: ctx.info.method,
      body: ctx.info.body,
      redirect: 'manual',
      headers: fetchHeaders,
      cf: {
        cacheEverything: false,
        cacheTtl: 0,
      },
    },
    timeout: BACKEND_FETCH_TIMEOUT,
  });

  ctx.log.debug('Backend response headers:', {
    status: beresp.status,
    contentType: beresp.headers.get('content-type'),
    contentEncoding: beresp.headers.get('content-encoding'),
    cacheStatus: beresp.headers.get('cf-cache-status'),
  });

  beresp = await inlineResources(ctx, beurl, beresp);

  // strip cf-cache-status and combine cache-tag and x-cache-tag
  const headers = new Headers(beresp.headers);
  headers.delete('cf-cache-status');
  const cfCacheTags = new Set([
    ...(headers.get('cache-tag')?.split(',') || []),
    ...(headers.get('x-cache-tag')?.split(',') || []),
  ]);
  if (cfCacheTags.size) {
    const cacheTag = [...cfCacheTags].join(',');
    headers.set('cache-tag', cacheTag);
    headers.set('x-cache-tag', cacheTag); // forward for debugging
  }

  if (isPipelineReq && !ctx.info.headers['x-forwarded-host']) {
    headers.set('x-robots-tag', 'noindex, nofollow');
  }

  if (checkConditional && notModified(ctx, headers, beresp.status)) {
    ctx.log.debug('Answering 304 for merged page:', {
      ifModifiedSince: ctx.info.headers['if-modified-since'],
      lastModified: headers.get('last-modified'),
    });
    headers.delete('content-length');
    headers.delete('content-encoding');
    await beresp.body?.cancel();
    return new Response(null, {
      status: 304,
      headers: Object.fromEntries(headers.entries()),
    });
  }

  return new Response(beresp.body, {
    status: beresp.status,
    headers: Object.fromEntries(headers.entries()),
  });
}
