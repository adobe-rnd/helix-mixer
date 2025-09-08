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
 * Base64url-encode a DNS wire message.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function b64url(bytes) {
  try {
    // eslint-disable-next-line no-undef
    return Buffer.from(bytes).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]);
    }
    // eslint-disable-next-line no-undef
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

/**
 * Build a minimal DNS query message for a single QNAME/QTYPE.
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

/**
 * Resolve CNAME via DoH GET (RFC 8484) using dynamic backends for egress.
 * Always uses dynamic backend; ignored in runtimes that don't support it.
 * @param {string} domain
 * @returns {Promise<string|null>}
 */
async function resolveCnameViaDoH(domain) {
  const query = buildQuery(domain, 5);
  const url = new URL('https://dns.google/dns-query');
  url.searchParams.set('dns', b64url(query));
  /** @type {RequestInit & { backend?: unknown }} */
  const init = {
    method: 'GET',
    headers: { accept: 'application/dns-message' },
    backend: { target: 'https://dns.google' },
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    return null;
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const qdcount = dv.getUint16(4);
  const ancount = dv.getUint16(6);
  let off = 12;
  for (let i = 0; i < qdcount; i += 1) {
    const { read } = decodeName(buf, off);
    off += read;
    off += 4;
  }
  for (let i = 0; i < ancount; i += 1) {
    const nameInfo = decodeName(buf, off);
    off += nameInfo.read;
    const type = dv.getUint16(off);
    off += 2;
    dv.getUint16(off); // class
    off += 2;
    dv.getUint32(off); // ttl
    off += 4;
    const rdlength = dv.getUint16(off);
    off += 2;
    if (type === 5) {
      const { name } = decodeName(buf, off);
      return name.replace(/\.$/, '');
    }
    off += rdlength;
  }
  return null;
}

/**
 * Resolve custom domains to network origin CNAMEs.
 * Cloudflare/Node: use node:dns; otherwise DoH GET.
 * @param {string} domain
 * @returns {Promise<string|null>}
 */
export async function resolveCustomDomain(domain) {
  const pattern = /^[^-]+--[^-]+--[^.]+\.domains\.aem\.network$/;
  const nodeish = typeof process !== 'undefined' && !!process.versions?.node;
  if (nodeish) {
    try {
      const dns = await import('node:dns');
      const recs = await dns.promises.resolve(domain, 'CNAME');
      if (Array.isArray(recs) && recs.length) {
        const cname = recs[0].replace(/\.$/, '');
        return pattern.test(cname) ? cname : null;
      }
    } catch (e) {
      // fall through to DoH
      // eslint-disable-next-line no-console
      console.debug(`node:dns CNAME failed for ${domain}: ${e.message}`);
    }
  }
  try {
    const cname = await resolveCnameViaDoH(domain);
    return cname && pattern.test(cname) ? cname : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.debug(`DoH CNAME failed for ${domain}: ${e.message}`);
    return null;
  }
}
