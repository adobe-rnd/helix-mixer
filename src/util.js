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

/**
 * @param {import('@cloudflare/workers-types').Fetcher} [impl] - fetch implementation to use
 * @returns {(
 *  url: string,
 *  init?: import("@cloudflare/workers-types").RequestInit
 * ) => Promise<import("@cloudflare/workers-types").Response>}
 */
export const ffetch = (impl) => async (url, init) => {
  /** @type {import("@cloudflare/workers-types").Fetcher['fetch']} */
  // @ts-ignore
  const { fetch } = impl || globalThis;
  // @ts-ignore
  const resp = await fetch.call(impl, url, init);
  console.debug({
    url,
    status: resp.status,
    statusText: resp.statusText,
    headers: Object.fromEntries(resp.headers),
  });
  return resp;
};

/**
 * A custom error that includes a response property.
 * @extends Error
 */
export class ResponseError extends Error {
  /**
   * Creates a ResponseError instance.
   * @param {string} message - The error message.
   * @param {import("@cloudflare/workers-types").Response} response
   */
  constructor(message, response) {
    super(message);
    this.response = response;

    // Set the prototype explicitly for correct instance checks
    Object.setPrototypeOf(this, ResponseError.prototype);
  }
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {import("@cloudflare/workers-types").Response} - A response object.
 */
export function errorResponse(status, xError, body = '') {
  // @ts-ignore
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: { 'x-error': xError },
  });
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {Error & {response: import("@cloudflare/workers-types").Response}}
 */
export function errorWithResponse(status, xError, body = '') {
  const response = errorResponse(status, xError, body);
  const error = new ResponseError(xError, response);
  return error;
}

/**
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const reString = glob
    .replaceAll('**', '|')
    .replaceAll('*', '[^/]*')
    .replaceAll('|', '.*');
  return new RegExp(`^${reString}$`);
}

/**
 * Checks if a URL has a custom domain (not a known service domain)
 * @param {URL} url - The URL object to check
 * @returns {boolean} - false if hostname ends with known service patterns, true otherwise
 */
export function isCustomDomain(url) {
  if (!url?.hostname) {
    return true;
  }
  if (url.hostname === 'localhost') {
    return false;
  }

  const servicePatterns = [
    '.workers.dev',
    '.aem.network',
    '.aem-mesh.live',
  ];

  return !servicePatterns.some((pattern) => url.hostname.endsWith(pattern));
}

/**
 * Resolves a custom domain's CNAME record and returns it if it matches the
 * pattern *--*--*.domains.aem.network
 * @param {string} domain - The custom domain to resolve
 * @returns {Promise<string|null>} - The CNAME record if it matches the pattern, null otherwise
 */
export async function resolveCustomDomain(domain) {
  try {
    // Use dynamic import to only load dns when needed
    const dns = await import('node:dns');

    // Resolve CNAME records for the domain
    const cnameRecords = await dns.promises.resolve(domain, 'CNAME');

    if (!cnameRecords || cnameRecords.length === 0) {
      return null;
    }

    // Get the first CNAME record
    const cname = cnameRecords[0];

    // Check if it matches the pattern *--*--*.domains.aem.network
    const pattern = /^[^-]+--[^-]+--[^.]+\.domains\.aem\.network$/;

    if (pattern.test(cname)) {
      return cname;
    }

    return null;
  } catch (error) {
    // If DNS resolution fails or domain doesn't exist, return null
    console.debug(`Failed to resolve CNAME for ${domain}:`, error.message);
    return null;
  }
}
