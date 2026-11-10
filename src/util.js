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

/* eslint-disable max-classes-per-file */

const SENSITIVE_HEADERS = new Set([
  'api-key',
  'authorization',
  'cf-access-client-secret',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-access-token',
  'x-aem-edge-key',
  'x-api-key',
  'x-auth-token',
  'x-forwarded-client-cert',
]);

/**
 * @param {Record<string, unknown>} headers
 * @returns {Record<string, unknown>}
 */
export function redactHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => {
      const normalizedName = name.toLowerCase();
      return [
        name,
        SENSITIVE_HEADERS.has(normalizedName) || normalizedName.endsWith('-secret') || normalizedName.endsWith('-token')
          ? '[redacted]'
          : value,
      ];
    }),
  );
}

/**
 * Thrown by {@link ffetch} when no response headers arrived within the timeout.
 */
export class FetchTimeoutError extends Error {
  /**
   * @param {number} timeout - The timeout in milliseconds.
   */
  constructor(timeout) {
    super(`fetch timeout after ${timeout}ms`);
    this.name = 'FetchTimeoutError';
    this.timeout = timeout;
    Object.setPrototypeOf(this, FetchTimeoutError.prototype);
  }
}

/**
 * Races `promise` against a timer. Rejects with a {@link FetchTimeoutError} if it
 * hasn't settled within `timeout` ms, after calling `onTimeout` (e.g. to abort).
 * The timer is always cleared.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeout
 * @param {(error: FetchTimeoutError) => void} [onTimeout]
 * @returns {Promise<T>}
 */
export async function withTimeout(promise, timeout, onTimeout) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new FetchTimeoutError(timeout);
      // reject first, so the race settles with the timeout error, not an abort error
      reject(error);
      onTimeout?.(error);
    }, timeout);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch that rejects with a {@link FetchTimeoutError} if it doesn't complete within
 * `timeout` ms. By default that's until the response headers arrive. If `read` is
 * given, it runs inside the timeout too, so callers that buffer the body (e.g.
 * `(res) => res.json()`) are covered until the body is read.
 *
 * Fastly Compute has no `AbortController` / `AbortSignal`, so the timeout is enforced
 * with `setTimeout` and `Promise.race`, which works on every runtime. Where
 * `AbortController` exists (Cloudflare, Node), the subrequest is also aborted. The
 * timer is cleared once `read` completes, so a body streamed afterwards is never
 * aborted.
 *
 * @template [T=Response]
 * @param {string|URL} url
 * @param {Record<string, unknown>} init
 * @param {number} timeout
 * @param {(response: Response) => T | Promise<T>} [read]
 * @returns {Promise<T>}
 */
export async function fetchWithTimeout(url, init, timeout, read) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  // @ts-ignore
  const pending = fetch(url, controller ? { ...init, signal: controller.signal } : init);
  return withTimeout(
    read ? pending.then(read) : pending,
    timeout,
    (error) => controller?.abort(error),
  );
}

/**
 * Fetch with debug logging and an optional timeout. See {@link fetchWithTimeout}
 * for `timeout` and `read`.
 *
 * @type {<T = import("@cloudflare/workers-types").Response>(
 *  url: string|URL,
 *  init?: import("@cloudflare/workers-types").RequestInit | Record<string, unknown>,
 *  opts?: { timeout?: number, read?: (response: any) => T | Promise<T> }
 * ) => Promise<T>}
 */
export const ffetch = async (url, init, { timeout, read } = {}) => {
  const onResponse = (resp) => {
    console.debug({
      url,
      status: resp.status,
      statusText: resp.statusText,
      headers: redactHeaders(Object.fromEntries(resp.headers)),
    });
    return read ? read(resp) : resp;
  };
  if (typeof timeout === 'number') {
    // @ts-ignore
    return fetchWithTimeout(url, init, timeout, onResponse);
  }
  // @ts-ignore
  return onResponse(await fetch(url, init));
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
 * @param {Record<string,string>} [headers] - Additional response headers.
 * @returns {import("@cloudflare/workers-types").Response} - A response object.
 */
export function errorResponse(status, xError, body = '', headers = {}) {
  // @ts-ignore
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: { ...headers, 'x-error': xError },
  });
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @param {Record<string,string>} [headers] - Additional response headers.
 * @returns {Error & {response: import("@cloudflare/workers-types").Response}}
 */
export function errorWithResponse(status, xError, body = '', headers = {}) {
  const response = errorResponse(status, xError, body, headers);
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
 * Converts a hostname glob to a RegExp. Unlike {@link globToRegExp} (which is
 * path-oriented and treats `/` as the segment separator), this treats `.` as the
 * label separator:
 *  - `*`  matches within a single label (any chars except a dot), e.g. `*.acme.com`
 *         matches `uat.acme.com` but not `a.b.acme.com`. A label may contain `-`,
 *         so `*--acme--org.aem.network` matches `main--…` and `dev-pdp--…`.
 *  - `**` matches across labels (any chars incl. dots).
 * Literal dots are escaped, and matching is case-insensitive.
 * @param {string} glob
 * @returns {RegExp}
 */
export function hostGlobToRegExp(glob) {
  // escape regex special chars (notably '.'), leaving '*' for glob expansion below
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const placeholder = '__DOUBLE_WILDCARD__';
  const reString = escaped
    .replaceAll('**', placeholder)
    .replaceAll('*', '[^.]*')
    .replaceAll(placeholder, '.*');
  return new RegExp(`^${reString}$`, 'i');
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
