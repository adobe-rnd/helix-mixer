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

// Universal entrypoint used by helix-deploy + helix-deploy-plugin-edge
// It adapts the runtime-specific context (Cloudflare Workers or Fastly C@E)
// to the internal Context consumed by helix-mixer's handler.

import { makeContext } from './index.js';
import { resolveConfig } from './config.js';
import handler from './handler.js';
import { errorResponse } from './util.js';

/**
 * Universal function signature expected by helix-deploy-plugin-edge.
 * @param {Request} request
 * @param {object} context - runtime context injected by the adapter
 * @returns {Promise<Response>}
 */
export async function main(request, context = {}) {
  const env = context.env || {};
  // The internal code doesn't currently use ExecutionContext, so pass-through is fine.
  const execCtx = context.executionContext || {};

  const ctx = await makeContext(execCtx, request, env);
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
    // eslint-disable-next-line no-console
    console.error(e);
    return errorResponse(500, 'internal server error');
  }
}
