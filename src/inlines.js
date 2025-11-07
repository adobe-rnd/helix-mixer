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

/**
 * @type {string[]}
 */
const INLINE_ORIGINS = [
  '.aem.live',
  '.aem.page',
  'pipeline-cloudflare.adobecommerce.live',
];

/**
 * Pull out the nav/footer location from the meta tags, if present.
 * Exclude resources if they dont also exist in the body.
 *
 * @param {string} markup
 * @returns {{nav?: string, footer?: string}} paths to resources to fetch
 */
function extractInlineMeta(markup) {
  const hasNavTag = markup.includes('<header></header>');
  const hasFooterTag = markup.includes('<footer></footer>');
  /** @type {{nav?: string, footer?: string}} */
  const meta = {};
  if (hasNavTag) {
    const navPath = markup.match(/<meta name="nav" content="([^"]+)"/);
    if (navPath) {
      // eslint-disable-next-line prefer-destructuring
      meta.nav = navPath[1];
    }
  }
  if (hasFooterTag) {
    const footerPath = markup.match(/<meta name="footer" content="([^"]+)"/);
    if (footerPath) {
      // eslint-disable-next-line prefer-destructuring
      meta.footer = footerPath[1];
    }
  }
  return meta;
}

/**
 * Inline a tag into the markup and return the updated markup.
 * Append any new cache keys to the cacheKeys array.
 * @param {Context} ctx
 * @param {string} markup
 * @param {string[]} cacheKeys
 * @param {string} path path to resource to fetch
 * @param {'header' | 'footer'} tag tag to replace in markup
 * @returns {Promise<string>}
 */
async function inlineTag(ctx, markup, cacheKeys, path, tag) {
  const ppath = path.endsWith('.plain.html') ? path : `${path}.plain.html`;
  const tagResponse = await fetch(new URL(ppath, `${ctx.config.protocol}://${ctx.config.origin}`));
  if (tagResponse.status !== 200 || !tagResponse.headers.get('content-type')?.includes('text/html')) {
    ctx.log.warn(`Failed to inline ${tag} from ${path}: ${tagResponse.status}`);
    return markup;
  }
  const newCacheKeys = (tagResponse.headers.get('surrogate-key') || '').split(' ');
  cacheKeys.push(...newCacheKeys);
  const tagMarkup = await tagResponse.text();
  markup = markup.replace(`<${tag}></${tag}>`, `<${tag}>${tagMarkup}</${tag}>`);
  return markup;
}

/**
 * If config defines inlines, and the original requested resource is:
 *   0. a GET request
 *   1. an HTML document
 *   2. coming from *.aem.live|*.aem.page|pipeline-cloudflare.adobecommerce.live
 *   3. contains a <meta name="nav|footer" content="..."> tag
 *   4. contains a <header> or <footer> element
 *   5. is not a .plain.html resource
 * Then fetch and inline the nav and/or footer markup into the response body
 * and include the corresponding cache keys.
 *
 * @param {Context} ctx
 * @param {URL} beurl
 * @param {import('@cloudflare/workers-types').Response} response
 * @returns {Promise<import('@cloudflare/workers-types').Response>}
 */
export default async function inlineResources(ctx, beurl, response) {
  const { config, info } = ctx;
  if (!config.inlineNav && !config.inlineFooter) {
    return response;
  }

  if (info.method !== 'GET') {
    return response;
  }

  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  if (!INLINE_ORIGINS.some((origin) => beurl.origin.endsWith(origin))) {
    return response;
  }

  if (beurl.pathname.endsWith('.plain.html')) {
    return response;
  }

  // get the markup
  let markup = await response.text();
  const meta = extractInlineMeta(markup);
  if (!meta.nav && !meta.footer) {
    return new Response(markup, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
      },
    });
  }

  // TODO: handle all CDNs' forms of cache tags
  const cacheKeys = response.headers.get('surrogate-key')?.split(' ') || [];
  markup = await inlineTag(ctx, markup, cacheKeys, meta.nav, 'header');
  markup = await inlineTag(ctx, markup, cacheKeys, meta.footer, 'footer');

  // rebuild the response with the updated markup and cache keys
  return new Response(markup, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      ...(cacheKeys.length ? {
        'surrogate-key': ([...new Set(cacheKeys)]).join(' '),
      } : {}),
    },
  });
}
