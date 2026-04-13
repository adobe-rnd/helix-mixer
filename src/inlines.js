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

import { ffetch } from './util.js';
import { readResponseText } from './decompress.js';

/**
 * @type {string[]}
 */
const INLINE_ORIGINS = [
  '.aem.live',
  '.aem.page',
  'pipeline-cloudflare.adobecommerce.live',
];

const ANCHOR_RE = /<a(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/a>/gi;
/**
 * Max chars after `</a>` to look for a matching `</p>` / `</div>`
 * (avoids scanning the rest of the document).
 */
const WRAPPER_CLOSE_LOOKAHEAD = 1024;
const CLOSE_WRAPPER_RE = /^\s*<\/(?<tag>p|div)>/i;
/**
 * Open tag interior between `<` and `>` for `<p` / `<div`
 * (same constraint as former OPEN_WRAPPER_RE).
 */
const OPEN_WRAPPER_INNER_RE = /^(?<tag>p|div)(?:\s[^>]*)?$/i;
const OPEN_TAG_RE = /^<a(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>/i;
const HREF_ATTR_RE = /\shref\s*=\s*(["'])(?<href>\/[^"'<>]*)\1/i;

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
 * Indent each line at the beginning by the number of spaces.
 * @param {string} markup
 * @param {number} indentCount
 * @returns {string}
 */
function indent(markup, indentCount) {
  return markup.replace(/^/gm, ' '.repeat(indentCount));
}

/**
 * Preserve the first line as-is because the line's leading whitespace remains
 * outside the replacement range in the source markup.
 * @param {string} markup
 * @param {number} indentCount
 * @returns {string}
 */
function indentSubsequentLines(markup, indentCount) {
  return markup.replace(/\n/g, `\n${' '.repeat(indentCount)}`);
}

/**
 * Header bag compatible with DOM and worker `Headers` (only `.get` is used).
 * @param {{ get: (name: string) => string | null | undefined }} headers
 * @returns {Record<string, Set<string>>}
 */
function createCacheKeys(headers) {
  return {
    // fastly
    'surrogate-key': new Set(headers.get('surrogate-key')?.split(' ') || []),
    // akamai
    'edge-cache-tag': new Set(headers.get('edge-cache-tag')?.split(',') || []),
    // cloudflare
    'cache-tag': new Set(headers.get('cache-tag')?.split(',') || []),
    // cache-tag headers may be stripped by cloudflare, collect x-cache-tag as well
    'x-cache-tag': new Set(headers.get('x-cache-tag')?.split(',') || []),
  };
}

/**
 * @param {Record<string, Set<string>>} cacheKeys
 * @param {{ get: (name: string) => string | null | undefined }} headers
 */
function mergeCacheKeys(cacheKeys, headers) {
  for (const [key, value] of Object.entries(cacheKeys)) {
    const delimiter = key === 'surrogate-key' ? ' ' : ',';
    const strValue = headers.get(key)?.trim();
    if (strValue) {
      strValue.split(delimiter).forEach((v) => value.add(v.trim()));
    }
  }
}

/**
 * @param {Context} ctx
 * @returns {string[]}
 */
function getInlinePaths(ctx) {
  return ctx.config.inlineFragments?.paths || [];
}

/**
 * @param {string} markup
 * @param {number} index
 * @returns {number}
 */
function getIndentCount(markup, index) {
  const lineStart = markup.lastIndexOf('\n', index - 1) + 1;
  let indentCount = 0;
  for (let i = lineStart; i < index; i += 1) {
    const ch = markup[i];
    if (ch === ' ') {
      indentCount += 1;
    } else if (ch === '\t') {
      indentCount += 2;
    } else {
      return 0;
    }
  }
  return indentCount;
}

/**
 * @param {Context} ctx
 * @param {string} path
 * @returns {URL}
 */
function getInlineUrl(ctx, path) {
  const url = new URL(path, `${ctx.config.protocol}://${ctx.config.origin}`);
  url.hash = '';
  if (!url.pathname.endsWith('.plain.html')) {
    url.pathname = `${url.pathname}.plain.html`;
  }
  return url;
}

/**
 * Returns the normalized href ending with #inline if it should be inlined, or null.
 * Path-matched hrefs get #inline appended; hrefs already ending with #inline pass through.
 * @param {string} href
 * @param {string[]} inlinePaths
 * @returns {string|null}
 */
function normalizeInlineHref(href, inlinePaths) {
  if (!href || !href.startsWith('/') || href.startsWith('//')) {
    return null;
  }
  if (href.endsWith('#inline')) {
    return href;
  }
  if (inlinePaths.length) {
    const qIdx = href.indexOf('?');
    const hIdx = href.indexOf('#');
    const endIdx = Math.min(
      qIdx >= 0 ? qIdx : href.length,
      hIdx >= 0 ? hIdx : href.length,
    );
    const pathname = href.slice(0, endIdx);
    if (inlinePaths.some((path) => pathname.startsWith(path))) {
      const withoutHash = hIdx >= 0 ? href.slice(0, hIdx) : href;
      return `${withoutHash}#inline`;
    }
  }
  return null;
}

/**
 * @param {string} anchorMarkup
 * @returns {string}
 */
function extractHref(anchorMarkup) {
  const openTag = anchorMarkup.match(OPEN_TAG_RE)?.[0];
  if (!openTag) {
    return '';
  }

  return openTag.match(HREF_ATTR_RE)?.groups?.href || '';
}

/**
 * @param {string} markup
 * @param {RegExp} re
 * @returns {{ index: number, text: string, groups: Record<string, string> }[]}
 */
function collectMatches(markup, re) {
  const matches = [];
  re.lastIndex = 0;
  let match = re.exec(markup);
  while (match) {
    matches.push({
      index: match.index,
      text: match[0],
      groups: match.groups || {},
    });
    match = re.exec(markup);
  }
  return matches;
}

/**
 * @param {{ start: number, end: number }[]} replacements
 * @param {number} index
 * @returns {boolean}
 */
function replacementExistsAt(replacements, index) {
  return replacements.some(({ start, end }) => index >= start && index < end);
}

/**
 * If the anchor at [start, end) is directly inside a minimal `<p>` or `<div>` wrapper
 * (only whitespace between the open `>` and `<a`, and optional whitespace then `</p|div>`
 * after `</a>`), return that wrapper's span in markup. Uses index scans instead of slicing
 * the entire prefix.
 *
 * @param {string} markup
 * @param {number} start - index of `<a`
 * @param {number} end - index after `</a>`
 * @returns {{ start: number, end: number } | null}
 */
function findImmediateWrapper(markup, start, end) {
  let i = start - 1;
  while (i >= 0 && /\s/.test(markup[i])) {
    i -= 1;
  }
  if (i < 0 || markup[i] !== '>') {
    return null;
  }
  const gt = i;
  let lt = gt - 1;
  while (lt >= 0 && markup[lt] !== '<') {
    lt -= 1;
  }
  if (lt < 0) {
    return null;
  }
  const inner = markup.slice(lt + 1, gt);
  const openMatch = inner.match(OPEN_WRAPPER_INNER_RE);
  if (!openMatch?.groups?.tag) {
    return null;
  }
  const openTag = openMatch.groups.tag.toLowerCase();

  const afterLimit = Math.min(markup.length, end + WRAPPER_CLOSE_LOOKAHEAD);
  const closeRegion = markup.slice(end, afterLimit);
  const closeMatch = closeRegion.match(CLOSE_WRAPPER_RE);
  if (!closeMatch?.groups?.tag) {
    return null;
  }
  if (closeMatch.groups.tag.toLowerCase() !== openTag) {
    return null;
  }

  return {
    start: lt,
    end: end + closeMatch[0].length,
  };
}

/**
 * @param {string} markup
 * @param {{ start: number, end: number, replacement: string }[]} replacements
 * @returns {string}
 */
function applyReplacements(markup, replacements) {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((acc, { start, end, replacement }) => `${acc.slice(0, start)}${replacement}${acc.slice(end)}`, markup);
}

/**
 * @param {Context} ctx
 * @param {Record<string, Set<string>>} cacheKeys
 * @param {string} path
 * @returns {Promise<string|null>}
 */
async function fetchFragmentMarkup(ctx, cacheKeys, path) {
  const url = getInlineUrl(ctx, path);
  const tagResponse = await ffetch(url.toString(), {
    headers: {
      'accept-encoding': 'identity',
      'x-byo-cdn-type': ctx.info.headers['x-byo-cdn-type'],
      'x-push-invalidation': ctx.info.headers['x-push-invalidation'],
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });
  if (tagResponse.status !== 200 || !tagResponse.headers.get('content-type')?.includes('text/html')) {
    ctx.log.warn(`Failed to inline fragment from ${path}: ${tagResponse.status}`);
    return null;
  }

  mergeCacheKeys(cacheKeys, tagResponse.headers);
  return tagResponse.text();
}

/**
 * Inline a tag into the markup and return the updated markup.
 * Append any new cache keys to the cacheKeys array.
 * @param {Context} ctx
 * @param {string} markup
 * @param {Record<string, Set<string>>} cacheKeys
 * @param {string} path path to resource to fetch
 * @param {'header' | 'footer'} tag tag to replace in markup
 * @returns {Promise<string>}
 */
async function inlineTag(ctx, markup, cacheKeys, path, tag) {
  if (!path) {
    return markup;
  }

  const ppath = path.endsWith('.plain.html') ? path : `${path}.plain.html`;
  const url = new URL(ppath, `${ctx.config.protocol}://${ctx.config.origin}`);
  const tagResponse = await ffetch(url.toString(), {
    headers: {
      'x-byo-cdn-type': ctx.info.headers['x-byo-cdn-type'],
      'x-push-invalidation': ctx.info.headers['x-push-invalidation'],
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });
  if (tagResponse.status !== 200 || !tagResponse.headers.get('content-type')?.includes('text/html')) {
    ctx.log.warn(`Failed to inline ${tag} from ${path}: ${tagResponse.status}`);
    return markup;
  }

  mergeCacheKeys(cacheKeys, tagResponse.headers);
  const tagMarkup = await tagResponse.text();
  const indentMatch = markup.match(new RegExp(`([^\\S\\n]*)<${tag}>`));
  /* c8 ignore next */
  const indentCount = indentMatch?.[1]?.length ?? 0;

  markup = markup.replace(`<${tag}></${tag}>`, `<${tag}>
${indent(tagMarkup.trim(), indentCount + 2)}
${' '.repeat(indentCount)}</${tag}>`);
  return markup;
}

/**
 * @param {Context} ctx
 * @param {string} markup
 * @param {Record<string, Set<string>>} cacheKeys
 * @returns {Promise<string>}
 */
async function inlineFragments(ctx, markup, cacheKeys) {
  const inlinePaths = getInlinePaths(ctx);
  if (inlinePaths.length === 0 && !markup.includes('#inline')) {
    return markup;
  }

  const anchorMatches = collectMatches(markup, ANCHOR_RE)
    .map((match) => {
      const href = normalizeInlineHref(extractHref(match.text), inlinePaths);
      return href ? { ...match, href } : null;
    })
    .filter(Boolean);

  if (!anchorMatches.length) return markup;

  // Fetch unique fragments only, all in parallel
  const uniqueHrefs = [...new Set(anchorMatches.map((m) => m.href))];
  /** @type {Map<string, string>} */
  const fragmentMap = new Map();
  await Promise.all(uniqueHrefs.map(async (href) => {
    const fm = await fetchFragmentMarkup(ctx, cacheKeys, href);
    if (fm) {
      fragmentMap.set(href, fm);
    }
  }));

  if (!fragmentMap.size) return markup;

  const replacements = anchorMatches
    .map((match) => {
      const fragmentMarkup = fragmentMap.get(match.href);
      if (!fragmentMarkup) return null;

      const wrapper = findImmediateWrapper(markup, match.index, match.index + match.text.length);
      if (wrapper) {
        return {
          start: wrapper.start,
          end: wrapper.end,
          replacement: indentSubsequentLines(
            fragmentMarkup.trim(),
            getIndentCount(markup, wrapper.start),
          ),
        };
      }
      return {
        start: match.index,
        end: match.index + match.text.length,
        replacement: fragmentMarkup.trim(),
      };
    })
    .filter(Boolean);

  const dedupedReplacements = replacements.filter((replacement, index) => !replacementExistsAt(
    replacements.slice(0, index),
    replacement.start,
  ));
  return dedupedReplacements.length ? applyReplacements(markup, dedupedReplacements) : markup;
}

/**
 * Determine the compression hint based on client's Accept-Encoding.
 * @param {Context} ctx
 * @returns {string|undefined} 'gzip' or 'deflate' if supported, undefined otherwise
 */
function getCompressionHint(ctx) {
  const acceptEncoding = ctx.info.headers['accept-encoding']?.toLowerCase() || '';
  if (acceptEncoding.includes('gzip')) {
    return 'gzip';
  }
  if (acceptEncoding.includes('deflate')) {
    return 'deflate';
  }
  return undefined;
}

/**
 * Check if the config defines inlines.
 * @param {Context} ctx
 * @returns {boolean}
 */
export function inlineConfigured(ctx) {
  const { config } = ctx;
  return !!config.inlineNav || !!config.inlineFooter || !!config.inlineFragments;
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
 * Additionally, if `inlineFragments` is configured, inline fragment links
 * (by path prefix or #inline suffix) into the markup.
 *
 * @param {Context} ctx
 * @param {URL} beurl
 * @param {Response} response
 * @returns {Promise<Response>}
 */
export default async function inlineResources(ctx, beurl, response) {
  const { info } = ctx;
  if (!inlineConfigured(ctx)) {
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

  // get the markup - automatically handles decompression if needed
  let markup;
  try {
    markup = await readResponseText(response, ctx);
  } catch (error) {
    ctx.log.error('Failed to read response text:', error);
    throw error;
  }
  const meta = extractInlineMeta(markup);
  const navPath = ctx.config.inlineNav ? meta.nav : undefined;
  const footerPath = ctx.config.inlineFooter ? meta.footer : undefined;

  // --- Inline fragments (additive, only when inlineFragments is configured) ---
  let fragmentCacheKeys;
  if (ctx.config.inlineFragments) {
    fragmentCacheKeys = createCacheKeys(response.headers);
    markup = await inlineFragments(ctx, markup, fragmentCacheKeys);
  }

  if (!navPath && !footerPath) {
    const compressionHint = getCompressionHint(ctx);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    if (compressionHint) {
      headers.set('x-compress-hint', compressionHint);
    }

    if (fragmentCacheKeys) {
      const cfUnion = new Set([
        ...fragmentCacheKeys['cache-tag'],
        ...fragmentCacheKeys['x-cache-tag'],
      ]);
      fragmentCacheKeys['cache-tag'] = cfUnion;
      fragmentCacheKeys['x-cache-tag'] = cfUnion;

      Object.entries(fragmentCacheKeys).forEach(([key, value]) => {
        const strValue = [...value].join(key === 'surrogate-key' ? ' ' : ',').trim();
        if (strValue) {
          headers.set(key, strValue);
        }
      });
    }

    return new Response(markup, {
      status: response.status,
      headers,
    });
  }

  const cacheKeys = createCacheKeys(response.headers);

  // Merge in any fragment cache keys
  if (fragmentCacheKeys) {
    for (const [key, value] of Object.entries(fragmentCacheKeys)) {
      value.forEach((v) => cacheKeys[key].add(v));
    }
  }

  markup = await inlineTag(ctx, markup, cacheKeys, navPath, 'header');
  markup = await inlineTag(ctx, markup, cacheKeys, footerPath, 'footer');

  // rebuild the response with the updated markup and cache keys
  // Combine cloudflare cache tags across both headers so both contain the union
  const cfUnion = new Set([
    ...cacheKeys['cache-tag'],
    ...cacheKeys['x-cache-tag'],
  ]);
  cacheKeys['cache-tag'] = cfUnion;
  cacheKeys['x-cache-tag'] = cfUnion;

  const cacheHeaders = {};
  for (const [key, value] of Object.entries(cacheKeys)) {
    const strValue = [...value].join(key === 'surrogate-key' ? ' ' : ',').trim();
    if (strValue) {
      cacheHeaders[key] = strValue;
    }
  }

  const compressionHint = getCompressionHint(ctx);
  // Remove content-encoding since we decompressed the response
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  if (compressionHint) {
    headers.set('x-compress-hint', compressionHint);
  }

  // Apply cache headers
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // Return uncompressed markup - CDN will handle compression via x-compress-hint
  return new Response(markup, {
    status: response.status,
    headers,
  });
}
