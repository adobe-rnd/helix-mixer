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
 * Fetches a required upstream resource. Timeouts and network errors are turned into a
 * `502` response error with an `x-error` identifying the stage and upstream host, e.g.
 * `config fetch timeout (config.example) after 15000ms`.
 *
 * @param {Context} ctx
 * @param {object} opts
 * @param {string} opts.stage name of the subrequest, e.g. `config` or `backend`
 * @param {string} opts.url
 * @param {Record<string, unknown>} opts.init fetch init
 * @param {number} opts.timeout timeout (ms) before the deadline cap
 * @returns {Promise<import("@cloudflare/workers-types").Response>}
 */
export async function fetchUpstream(ctx, {
  stage, url, init, timeout: maxTimeout,
}) {
  const { host } = new URL(url);
  const timeout = getTimeout(ctx, maxTimeout);
  const start = Date.now();
  try {
    return await ffetch(url, init, { timeout });
  } catch (e) {
    const message = e instanceof FetchTimeoutError
      ? `${stage} fetch timeout (${host}) after ${timeout}ms`
      : `${stage} fetch error (${host}): ${e.message}`;
    ctx.log.error(`${message} (elapsed=${Date.now() - start}ms, request=${ctx.requestId})`);
    throw errorWithResponse(502, toHeaderValue(message));
  }
}
