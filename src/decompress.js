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
 * Decompresses a Response based on its content-encoding header.
 * Supports gzip, deflate, and brotli compression.
 * Returns the original response if not compressed or encoding is not supported.
 *
 * @param {Response} response - The potentially compressed response
 * @param {object} ctx - Context object with logging
 * @returns {Promise<Response>} - Decompressed response with content-encoding header removed
 */
export async function decompressResponse(response, ctx) {
  const contentEncoding = response.headers.get('content-encoding');

  if (!contentEncoding || contentEncoding === 'identity') {
    // No compression or explicit identity encoding
    return response;
  }

  try {
    let decompressedStream;

    if (contentEncoding === 'gzip') {
      // Use DecompressionStream for gzip
      decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
      ctx.log.debug('Decompressing gzip response');
    } else if (contentEncoding === 'deflate') {
      // Use DecompressionStream for deflate
      decompressedStream = response.body.pipeThrough(new DecompressionStream('deflate'));
      ctx.log.debug('Decompressing deflate response');
    } else if (contentEncoding === 'br') {
      // Use brotli-wasm for brotli decompression
      try {
        // Dynamic import to avoid loading if not needed
        const brotliModule = await import('brotli-wasm');

        // Initialize brotli-wasm if needed
        if (typeof brotliModule.default === 'function') {
          await brotliModule.default();
        }

        // Read the entire compressed body
        const compressedData = new Uint8Array(await response.arrayBuffer());

        // Decompress using brotli-wasm
        const decompressedData = brotliModule.decompress(compressedData);

        // Create a new response with decompressed data
        const headers = new Headers(response.headers);
        headers.delete('content-encoding');
        headers.delete('content-length'); // Length will change after decompression

        ctx.log.debug('Decompressed brotli response');
        return new Response(decompressedData, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        ctx.log.error('Failed to decompress brotli:', error);
        // Fall back to returning compressed response
        return response;
      }
    } else {
      // Unknown encoding, return as-is
      ctx.log.warn(`Unknown content-encoding: ${contentEncoding}, returning compressed response`);
      return response;
    }

    // For gzip/deflate, create new response with decompressed stream
    if (decompressedStream) {
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.delete('content-length'); // Length will change after decompression

      return new Response(decompressedStream, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  } catch (error) {
    ctx.log.error(`Failed to decompress ${contentEncoding} response:`, error);
    // If decompression fails, return the original response
    // This allows the request to continue even if decompression isn't supported
  }

  return response;
}

/**
 * Attempts to read text from a potentially compressed response.
 * Automatically decompresses if needed.
 *
 * @param {Response} response - The potentially compressed response
 * @param {object} ctx - Context object with logging
 * @returns {Promise<string>} - The decompressed text content
 */
export async function readResponseText(response, ctx) {
  const decompressed = await decompressResponse(response, ctx);
  return decompressed.text();
}
