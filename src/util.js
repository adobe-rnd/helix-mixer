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

// Shared CI domain patterns
const CI_PATTERNS = [
  '.fastlyci.aem.network',
  '.cloudflareci.aem-mesh.live',
];

/**
 * Checks if a URL has a custom domain (not a known service domain)
 * @param {URL} url - The URL object to check
 * @param {Request} req - The request object to check
 * @returns {boolean} - false if hostname ends with known service patterns, true otherwise
 */
export function isCustomDomain(url, req) {
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

  const isServiceDomain = servicePatterns.some((pattern) => url.hostname.endsWith(pattern));
  const isCIDomain = CI_PATTERNS.some((pattern) => url.hostname.endsWith(pattern));
  const hasDomainOverride = isCIDomain && !!req?.headers?.get('x-custom-domain');

  return hasDomainOverride || !isServiceDomain;
}

/**
 * Gets the effective domain from a request, considering CI host overrides
 * @param {Request} req - The request object
 * @returns {string} - The effective domain
 * (from x-custom-domain header for CI hosts, or Host header otherwise)
 */
export function getEffectiveDomain(req) {
  const url = new URL(req.url);
  const isCIDomain = CI_PATTERNS.some((pattern) => url.hostname.endsWith(pattern));

  if (isCIDomain) {
    const customDomain = req.headers.get('x-custom-domain');
    if (customDomain) {
      return customDomain;
    }
  }

  // Return the Host header
  return req.headers.get('host');
}
