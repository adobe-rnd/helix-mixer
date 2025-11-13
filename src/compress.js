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
 * Compresses a Response based on the requested compression format.
 * Supports gzip and deflate compression.
 *
 * @param {Response} response - The uncompressed response
 * @param {string} format - The compression format ('gzip' or 'deflate')
 * @param {object} ctx - Context object with logging
 * @returns {Promise<Response>} - Compressed response with content-encoding header set
 */
export async function compressResponse(response, format, ctx) {
  if (!format || format === 'identity') {
    // No compression requested
    return response;
  }

  if (format !== 'gzip' && format !== 'deflate') {
    ctx.log.warn(`Unsupported compression format: ${format}, returning uncompressed response`);
    return response;
  }

  try {
    // Use CompressionStream for gzip or deflate
    const compressedStream = response.body.pipeThrough(new CompressionStream(format));
    ctx.log.debug(`Compressing response with ${format}`);

    const headers = new Headers(response.headers);
    headers.set('content-encoding', format);
    headers.delete('content-length'); // Length will change after compression

    return new Response(compressedStream, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    ctx.log.error(`Failed to compress response with ${format}:`, error);
    // If compression fails, return the original response
    return response;
  }
}
