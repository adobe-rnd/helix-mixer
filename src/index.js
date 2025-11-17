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

import { acmeChallenge } from './acme.js';
import { resolveConfig } from './config.js';
import { resolveCustomDomain } from './dns.js';
import handler from './handler.js';
import { errorResponse, getEffectiveDomain, isCustomDomain } from './util.js';

/**
 * @param {import("@cloudflare/workers-types").ExecutionContext} ectx
 * @param {Request} req the HTTP request object
 * @param {Env} env
 * @returns {Promise<Context>}
 */
export async function makeContext(ectx, req, env) {
  /** @type {Context} */
  // @ts-ignore
  const ctx = {
    executionContext: ectx,
  };
  // @ts-ignore
  ctx.attributes = {};
  ctx.env = env;
  ctx.url = new URL(req.url);
  if (isCustomDomain(ctx.url, req)) {
    const effectiveDomain = getEffectiveDomain(req);
    const networkOrigin = await resolveCustomDomain(effectiveDomain);
    if (networkOrigin) {
      console.debug(`Resolving custom domain ${effectiveDomain} to ${networkOrigin}`);
      ctx.url.host = networkOrigin;
    } else {
      console.warn(`Failed to resolve custom domain ${ctx.url.hostname}`);
    }
  }
  ctx.log = console;
  ctx.CERT = {};
  try {
    Object.entries(env).forEach(([k, v]) => {
      if (k.startsWith('CERT_')) {
        ctx.CERT[k.slice('CERT_'.length)] = v;
      }
    });
  } catch {
    // ignore
  }
  if (!Object.keys(ctx.CERT).length) {
    // Fallback for non-enumerable env proxies (e.g., helix-deploy plugin-edge adapters)
    ctx.CERT = new Proxy({}, {
      get: (_, prop) => env[`CERT_${String(prop)}`],
    });
  }
  ctx.info = {
    subdomain: ctx.url.hostname.split('.')[0],
    method: req.method,
    body: req.body,
    headers: Object.fromEntries(
      [...req.headers.entries()]
        .map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };
  return ctx;
}

/**
 * Universal entrypoint used by helix-deploy edge adapters and Cloudflare.
 * @param {Request} request
 * @param {object} context
 */
export async function main(request, context = {}) {
  const env = context.env || {};
  const pctx = context.executionContext || {};
  const ctx = await makeContext(pctx, request, env);

  const { pathname } = new URL(request.url);
  if (request.method === 'GET' && pathname && pathname.startsWith('/.well-known/acme-challenge/')) {
    ctx.log.info('[main] Routing to ACME challenge handler');
    return acmeChallenge(request, context);
  }

  try {
    const overrides = Object.fromEntries(ctx.url.searchParams.entries());
    const config = await resolveConfig(ctx, overrides);
    ctx.config = config;

    ctx.log.debug('resolved config: ', JSON.stringify(config));
    if (!config) {
      return errorResponse(404, 'config not found');
    }

    return await handler(ctx);
  } catch (e) {
    if (e.response) {
      return e.response;
    }
    ctx.log.error(e);
    return errorResponse(500, 'internal server error');
  }
}
