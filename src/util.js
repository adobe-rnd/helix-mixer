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

/**
 * @param {import('@cloudflare/workers-types').Fetcher} [impl] - fetch implementation to use
 * @returns {(
 *  url: string,
 *  init?: import("@cloudflare/workers-types").RequestInit
 * ) => Promise<import("@cloudflare/workers-types").Response>}
 */
export const ffetch = (impl) => async (url, init) => {
  /** @type {import("@cloudflare/workers-types").Fetcher['fetch']} */
  // @ts-ignore
  const { fetch } = impl || globalThis;
  // @ts-ignore
  const resp = await fetch.call(impl, url, init);
  console.debug({
    url,
    status: resp.status,
    statusText: resp.statusText,
    headers: Object.fromEntries(resp.headers),
  });
  return resp;
};

/**
 * A custom error that includes a response property.
 * @extends Error
 */
export class ResponseError extends Error {
  /**
   * Creates a ResponseError instance.
   * @param {string} message - The error message.
   * @param {import("@cloudflare/workers-types").Response} response
   */
  constructor(message, response) {
    super(message);
    this.response = response;

    // Set the prototype explicitly for correct instance checks
    Object.setPrototypeOf(this, ResponseError.prototype);
  }
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {import("@cloudflare/workers-types").Response} - A response object.
 */
export function errorResponse(status, xError, body = '') {
  // @ts-ignore
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: { 'x-error': xError },
  });
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {Error & {response: import("@cloudflare/workers-types").Response}}
 */
export function errorWithResponse(status, xError, body = '') {
  const response = errorResponse(status, xError, body);
  const error = new ResponseError(xError, response);
  return error;
}

/**
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const reString = glob
    .replaceAll('**', '|')
    .replaceAll('*', '[^/]*')
    .replaceAll('|', '.*');
  return new RegExp(`^${reString}$`);
}

/**
 * Checks if a URL has a custom domain (not a known service domain)
 * @param {URL} url - The URL object to check
 * @returns {boolean} - false if hostname ends with known service patterns, true otherwise
 */
export function isCustomDomain(url) {
  if (!url?.hostname) {
    return true;
  }

  const servicePatterns = [
    '.workers.dev',
    '.aem.network',
    '.aem-mesh.live',
  ];

  return !servicePatterns.some((pattern) => url.hostname.endsWith(pattern));
}

// DoH helper: base64url-encode a DNS wire message
// duplicate helper removed

function buildDnsQuery(name, qtype = 5 /* CNAME */) {
  const labels = name.split('.').filter(Boolean);
  const qnameLen = labels.reduce((acc, l) => acc + 1 + l.length, 1);
  const msg = new Uint8Array(12 + qnameLen + 4);
  const dv = new DataView(msg.buffer);
  dv.setUint16(0, Math.floor(Math.random() * 65536));
  dv.setUint16(2, 0x0100);
  dv.setUint16(4, 1);
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
  dv.setUint16(off, qtype);
  dv.setUint16(off + 2, 1);
  return msg;
}

/**
 * Decode a DNS name at the given offset, supporting pointer compression.
 * Returns the decoded name and bytes consumed at the original offset.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @returns {{ name: string, read: number }}
 */
function decodeName(buf, offset) {
  let off = offset;
  const labels = [];
  let jumped = false;
  let read = 0;
  const max = buf.length;
  // Prevent infinite loops in case of malformed pointers
  let guard = 0;
  while (off < max && guard < 256) {
    guard += 1;
    const len = buf[off];
    // pointer if top two bits set (>= 192)
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
 * Resolves a custom domain's CNAME record and returns it if it matches the
 * pattern *--*--*.domains.aem.network
 * @param {string} domain - The custom domain to resolve
 * @returns {Promise<string|null>} - The CNAME record if it matches the pattern, null otherwise
 */
// DoH helper: base64url-encode a DNS wire message
function bytesToBase64Url(bytes) {
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
    return btoa(bin)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

// DoH GET resolver (RFC 8484) – optionally uses Fastly dynamic backend
async function resolveCnameViaDoHGet(domain, useDynamicBackend = false) {
  const query = buildDnsQuery(domain, 5);
  const dnsParam = bytesToBase64Url(query);
  const url = new URL('https://dns.google/dns-query');
  url.searchParams.set('dns', dnsParam);
  /** @type {RequestInit & { backend?: unknown }} */
  const init = {
    method: 'GET',
    headers: { accept: 'application/dns-message' },
  };
  if (useDynamicBackend) {
    // Prefer dynamic backend on Fastly for direct egress with better caching
    init.backend = { target: 'https://dns.google' };
  }
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
    off += 4; // qtype + qclass
  }
  for (let i = 0; i < ancount; i += 1) {
    const nameInfo = decodeName(buf, off);
    off += nameInfo.read;
    const type = dv.getUint16(off);
    off += 2;
    dv.getUint16(off); // class IN
    off += 2;
    dv.getUint32(off); // ttl
    off += 4;
    const rdlength = dv.getUint16(off);
    off += 2;
    if (type === 5) { // CNAME
      const { name } = decodeName(buf, off);
      return name.replace(/\.$/, '');
    }
    off += rdlength;
  }
  return null;
}

export async function resolveCustomDomain(domain) {
  // Helper to match our expected network origin pattern
  const pattern = /^[^-]+--[^-]+--[^.]+\.domains\.aem\.network$/;

  // Try Node's DNS first when available (tests / dev / Cloudflare with nodejs_compat)
  const nodeish = typeof process !== 'undefined' && !!process.versions?.node;
  if (nodeish) {
    try {
      const dns = await import('node:dns');
      const cnameRecords = await dns.promises.resolve(domain, 'CNAME');
      if (Array.isArray(cnameRecords) && cnameRecords.length) {
        const cname = cnameRecords[0].replace(/\.$/, '');
        return pattern.test(cname) ? cname : null;
      }
    } catch (error) {
      console.debug(`Failed to resolve CNAME via node:dns for ${domain}:`, error.message);
    }
  }

  // Detect Fastly runtime (only required fallback per requirements)
  let isFastly = false;
  try {
    // eslint-disable-next-line import/no-unresolved
    await import('fastly:env');
    isFastly = true;
  } catch {
    // not Fastly
  }

  if (!nodeish && !isFastly) {
    // Non-node, non-Fastly environment: best effort DoH GET without backend hints (works on CF)
    try {
      const cname = await resolveCnameViaDoHGet(domain);
      return cname && pattern.test(cname) ? cname : null;
    } catch (error) {
      console.debug(`Failed to resolve CNAME for ${domain}:`, error.message);
      return null;
    }
  }

  if (isFastly) {
    // Fastly: use DoH GET and dynamic backend for better caching/perf
    try {
      const cname = await resolveCnameViaDoHGet(domain, true);
      return cname && pattern.test(cname) ? cname : null;
    } catch (error) {
      console.debug(`Failed to resolve CNAME for ${domain}:`, error.message);
      return null;
    }
  }

  // If we got here, either nodeish resolved to no data or some other env: give up gracefully
  return null;
}

/**
 * Build a minimal DNS query message for a single QNAME/QTYPE.
 * @param {string} name
 * @param {number} qtype
 * @returns {Uint8Array}
 */
// moved buildDnsQuery above

/**
 * Decode a DNS name at the given offset, supporting pointer compression.
 * Returns the decoded name and bytes consumed at the original offset.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @returns {{ name: string, read: number }}
 */
// duplicate decodeName removed

// (intentionally left blank – moved DoH helpers above)
