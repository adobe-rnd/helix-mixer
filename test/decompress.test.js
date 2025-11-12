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

import assert from 'assert';
import zlib from 'zlib';
import { decompressResponse, readResponseText } from '../src/decompress.js';

describe('decompress', () => {
  const mockCtx = {
    log: {
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  describe('decompressResponse', () => {
    it('should return uncompressed response as-is', async () => {
      const response = new Response('Hello World', {
        headers: { 'content-type': 'text/plain' },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(await result.text(), 'Hello World');
      assert.strictEqual(result.headers.get('content-encoding'), null);
    });

    it('should handle identity encoding', async () => {
      const response = new Response('Hello World', {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'identity',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(await result.text(), 'Hello World');
    });

    it('should decompress gzip content', async () => {
      const originalText = 'Hello World - this is gzip compressed content!';
      const compressed = zlib.gzipSync(Buffer.from(originalText));

      const response = new Response(compressed, {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'gzip',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(await result.text(), originalText);
      assert.strictEqual(result.headers.get('content-encoding'), null);
    });

    it('should decompress deflate content', async () => {
      const originalText = 'Hello World - this is deflate compressed content!';
      const compressed = zlib.deflateSync(Buffer.from(originalText));

      const response = new Response(compressed, {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'deflate',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(await result.text(), originalText);
      assert.strictEqual(result.headers.get('content-encoding'), null);
    });

    it('should decompress brotli content', async () => {
      const originalText = 'Hello World - this is brotli compressed content!';
      const compressed = zlib.brotliCompressSync(Buffer.from(originalText));

      const response = new Response(compressed, {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'br',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(await result.text(), originalText);
      assert.strictEqual(result.headers.get('content-encoding'), null);
    });

    it('should preserve response status and other headers', async () => {
      const originalText = 'Test content';
      const compressed = zlib.gzipSync(Buffer.from(originalText));

      const response = new Response(compressed, {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'text/html',
          'content-encoding': 'gzip',
          'cache-control': 'max-age=3600',
          'x-custom-header': 'test-value',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.statusText, 'Created');
      assert.strictEqual(result.headers.get('content-type'), 'text/html');
      assert.strictEqual(result.headers.get('cache-control'), 'max-age=3600');
      assert.strictEqual(result.headers.get('x-custom-header'), 'test-value');
      assert.strictEqual(result.headers.get('content-encoding'), null);
      assert.strictEqual(result.headers.get('content-length'), null);
    });

    it('should handle unknown encoding gracefully', async () => {
      const response = new Response('Some content', {
        headers: {
          'content-type': 'text/plain',
          'content-encoding': 'unknown-encoding',
        },
      });

      const result = await decompressResponse(response, mockCtx);
      // Should return original response when encoding is unknown
      assert.strictEqual(await result.text(), 'Some content');
      assert.strictEqual(result.headers.get('content-encoding'), 'unknown-encoding');
    });
  });

  describe('readResponseText', () => {
    it('should read uncompressed text', async () => {
      const response = new Response('Plain text content');
      const text = await readResponseText(response, mockCtx);
      assert.strictEqual(text, 'Plain text content');
    });

    it('should read and decompress gzip text', async () => {
      const originalText = 'Compressed text content';
      const compressed = zlib.gzipSync(Buffer.from(originalText));

      const response = new Response(compressed, {
        headers: { 'content-encoding': 'gzip' },
      });

      const text = await readResponseText(response, mockCtx);
      assert.strictEqual(text, originalText);
    });

    it('should handle HTML content', async () => {
      const html = '<!DOCTYPE html><html><body><h1>Test</h1></body></html>';
      const compressed = zlib.gzipSync(Buffer.from(html));

      const response = new Response(compressed, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-encoding': 'gzip',
        },
      });

      const text = await readResponseText(response, mockCtx);
      assert.strictEqual(text, html);
    });
  });
});
