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

// Live DNS-over-HTTPS tests.
// These intentionally call Google's public DoH endpoint to exercise the non-mocked path.
// Always enabled; kept resilient with retries and generous timeouts.

import assert from 'node:assert';
import { resolveCustomDomain } from '../src/dns.js';

/**
 * Build a minimal DNS query message for a single QNAME/QTYPE.
 * Copied from src/dns.js for the direct DoH verification test below.
 * @param {string} name
 * @param {number} qtype
 * @returns {Uint8Array}
 */
function buildQuery(name, qtype = 5 /* CNAME */) {
  const labels = name.split('.').filter(Boolean);
  const qnameLen = labels.reduce((acc, l) => acc + 1 + l.length, 1);
  const msg = new Uint8Array(12 + qnameLen + 4);
  const dv = new DataView(msg.buffer);
  dv.setUint16(0, Math.floor(Math.random() * 65536));
  dv.setUint16(2, 0x0100); // RD
  dv.setUint16(4, 1); // QDCOUNT
  let off = 12;
  for (const label of labels) {
    const len = Math.min(63, label.length);
    msg[off] = len;
    off += 1;
    for (let i = 0; i < len; i += 1) {
      msg[off] = label.charCodeAt(i);
      off += 1;
    }
  }
  msg[off] = 0;
  off += 1;
  dv.setUint16(off, qtype); // QTYPE
  dv.setUint16(off + 2, 1); // QCLASS IN
  return msg;
}

/**
 * Base64url-encode a DNS wire message.
 * Minimal copy to avoid importing private helpers.
 * @param {Uint8Array} bytes
 */
function b64url(bytes) {
  // eslint-disable-next-line no-undef
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a DNS name at the given offset, supporting pointer compression.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @returns {{ name: string, read: number }}
 */
function decodeName(buf, offset) {
  let off = offset;
  const labels = [];
  let jumped = false;
  let read = 0;
  let guard = 0;
  while (off < buf.length && guard < 256) {
    guard += 1;
    const len = buf[off];
    if (len >= 192) {
      const ptr = (len - 192) * 256 + buf[off + 1];
      if (!jumped) {
        read += 2;
      }
      off = ptr;
      jumped = true;
    } else if (len === 0) {
      if (!jumped) {
        read += 1;
      }
      break;
    } else {
      if (!jumped) {
        read += 1 + len;
      }
      off += 1;
      let label = '';
      for (let i = 0; i < len; i += 1) {
        label += String.fromCharCode(buf[off + i]);
      }
      labels.push(label);
      off += len;
    }
  }
  return { name: labels.join('.'), read };
}

describe('dns live tests (Google DoH)', function suite() {
  this.timeout(15000);
  this.retries(2);

  it('returns null for example.com (not an AEM custom domain)', async () => {
    const cname = await resolveCustomDomain('example.com'); // uses DoH
    assert.strictEqual(cname, null);
  });

  it('queries DoH directly and sees a CNAME for www.youtube.com', async () => {
    const q = buildQuery('www.youtube.com', 5);
    const url = new URL('https://dns.google/dns-query');
    url.searchParams.set('dns', b64url(q));
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/dns-message' },
    });
    assert.ok(res.ok, `unexpected DoH response status ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const qdcount = dv.getUint16(4);
    const ancount = dv.getUint16(6);
    let off = 12;
    for (let i = 0; i < qdcount; i += 1) {
      const { read } = decodeName(buf, off);
      off += read + 4; // skip QTYPE/QCLASS
    }
    let found = null;
    for (let i = 0; i < ancount; i += 1) {
      const nameInfo = decodeName(buf, off);
      off += nameInfo.read;
      const type = dv.getUint16(off);
      off += 2;
      off += 2; // class
      off += 4; // ttl
      const rdlength = dv.getUint16(off);
      off += 2;
      if (type === 5) {
        const ans = decodeName(buf, off);
        found = ans.name.replace(/\.$/, '');
        break;
      }
      off += rdlength;
    }
    // This value is historically stable; if it ever changes, we still assert a non-empty CNAME.
    assert.ok(found && found.length > 0, 'expected a CNAME in the DoH response');
    // Best‑effort exact check; ignore if it differs regionally.
    // Accept either the canonical google name or any l.google.com variant.
    assert.ok(/(^youtube-ui\.|\.l\.google\.com$)/.test(found) || found.includes('google'), `unexpected CNAME target: ${found}`);
  });
});
