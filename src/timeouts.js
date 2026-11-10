/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { errorWithResponse, ffetch, FetchTimeoutError } from './util.js';

/**
 * Overall deadline (ms) for a request, measured from when the request is received.
 * Every subrequest timeout is capped by the time left until this deadline, so slow
 * subrequests can't add up past it.
 */
export const REQUEST_DEADLINE = 30000;

/** Timeout (ms) until response headers for the config service fetch. */
export const CONFIG_FETCH_TIMEOUT = 15000;

/** Timeout (ms) until response headers for the backend fetch. */
export const BACKEND_FETCH_TIMEOUT = 30000;

/** Timeout (ms) until response headers for inlined fragment / header / footer fetches. */
export const INLINE_FETCH_TIMEOUT = 15000;

/** Timeout (ms) for a single DoH CNAME lookup. */
export const DNS_LOOKUP_TIMEOUT = 5000;

const MAX_HEADER_MESSAGE_LENGTH = 256;

/**
 * Makes a message safe to use as an HTTP header value.
 * @param {string} message
 * @returns {string}
 */
export function toHeaderValue(message) {
  return String(message)
    .replace(/[^\x20-\x7e]+/g, ' ')
    .trim()
    .slice(0, MAX_HEADER_MESSAGE_LENGTH);
}

/**
 * Returns the timeout to use for a subrequest: the given timeout, capped by the time
 * left until the request deadline (if any).
 * @param {Pick<Context, 'deadline'>} ctx
 * @param {number} timeout
 * @returns {number}
 */
export function getTimeout(ctx, timeout) {
  if (!ctx.deadline) {
    return timeout;
  }
  return Math.max(0, Math.min(timeout, ctx.deadline - Date.now()));
}

/**
 * Headers for responses that report an upstream problem, so downstream caches don't
 * keep a transient error.
 */
export const NO_STORE_HEADERS = Object.freeze({ 'cache-control': 'private, no-store' });

/**
 * Creates the `502` response error for a failed required upstream, and logs it.
 * @param {Context} ctx
 * @param {object} opts
 * @param {string} opts.stage name of the subrequest, e.g. `config` or `backend`
 * @param {string} opts.host upstream host
 * @param {Error} opts.error
 * @param {number} opts.timeout timeout (ms) that applied
 * @param {number} opts.start epoch ms when the subrequest started
 * @returns {Error & { response: Response }}
 */
export function upstreamError(ctx, {
  stage, host, error, timeout, start,
}) {
  const message = error instanceof FetchTimeoutError
    ? `${stage} fetch timeout (${host}) after ${timeout}ms`
    : `${stage} fetch error (${host}): ${error.message}`;
  ctx.log.error(`${message} (elapsed=${Date.now() - start}ms, request=${ctx.requestId})`);
  // @ts-ignore
  return errorWithResponse(502, toHeaderValue(message), '', NO_STORE_HEADERS);
}

/**
 * Fetches a required upstream resource. Timeouts and network errors are turned into a
 * `502` response error with an `x-error` identifying the stage and upstream host, e.g.
 * `config fetch timeout (config.example) after 15000ms`. If the request deadline has
 * already passed, the subrequest isn't sent.
 *
 * If `read` is given, it runs inside the timeout, and its errors (e.g. a body that
 * fails or stalls) are handled the same way.
 *
 * @template [T=import("@cloudflare/workers-types").Response]
 * @param {Context} ctx
 * @param {object} opts
 * @param {string} opts.stage name of the subrequest, e.g. `config` or `backend`
 * @param {string} opts.url
 * @param {Record<string, unknown>} opts.init fetch init
 * @param {number} opts.timeout timeout (ms) before the deadline cap
 * @param {(response: any) => T | Promise<T>} [opts.read]
 * @returns {Promise<T>}
 */
export async function fetchUpstream(ctx, {
  stage, url, init, timeout: maxTimeout, read,
}) {
  const { host } = new URL(url);
  const timeout = getTimeout(ctx, maxTimeout);
  if (timeout <= 0) {
    const message = `${stage} fetch skipped (${host}): request deadline exceeded`;
    ctx.log.error(`${message} (request=${ctx.requestId})`);
    throw errorWithResponse(502, message, '', NO_STORE_HEADERS);
  }
  const start = Date.now();
  try {
    // @ts-ignore
    return await ffetch(url, init, { timeout, read });
  } catch (error) {
    throw upstreamError(ctx, {
      stage, host, error, timeout, start,
    });
  }
}
