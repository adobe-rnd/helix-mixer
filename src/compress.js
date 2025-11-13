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
 * Compresses text content based on the requested compression format.
 * Supports gzip and deflate compression.
 *
 * @param {string} text - The uncompressed text content
 * @param {string} format - The compression format ('gzip' or 'deflate')
 * @param {object} ctx - Context object with logging
 * @returns {Promise<ReadableStream>} - Compressed stream
 */
export async function compressText(text, format, ctx) {
  if (!format || format === 'identity') {
    // No compression requested, return text as stream
    return new Response(text).body;
  }

  if (format !== 'gzip' && format !== 'deflate') {
    ctx.log.warn(`Unsupported compression format: ${format}, returning uncompressed`);
    return new Response(text).body;
  }

  try {
    // Create a readable stream from the text and compress it
    const textStream = new Response(text).body;
    const compressedStream = textStream.pipeThrough(new CompressionStream(format));
    ctx.log.debug(`Compressing text with ${format}`);
    return compressedStream;
  } catch (error) {
    ctx.log.error(`Failed to compress text with ${format}:`, error);
    // If compression fails, return uncompressed
    return new Response(text).body;
  }
}
