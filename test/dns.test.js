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

import assert from 'node:assert';
import { resolveCustomDomain } from '../src/dns.js';

function encodeName(name) {
  const labels = name.split('.').filter(Boolean);
  const bytes = [];
  for (const label of labels) {
    bytes.push(label.length);
    for (let i = 0; i < label.length; i += 1) {
      bytes.push(label.charCodeAt(i));
    }
  }
  bytes.push(0);
  return Uint8Array.from(bytes);
}

function makeDohResponse({
  qname,
  cnameTarget,
  ok = true,
  includeAnswer = true,
  ansType = 5,
}) {
  // Minimal DNS response with 1 question and optional 1 CNAME answer
  // using pointer compression for NAME
  const qnameBytes = encodeName(qname);
  const targetBytes = encodeName(cnameTarget);

  const header = new Uint8Array(12);
  const hdv = new DataView(header.buffer);
  hdv.setUint16(0, 0x1234); // id
  hdv.setUint16(2, 0x8180); // standard response, no error
  hdv.setUint16(4, 1); // QDCOUNT
  hdv.setUint16(6, includeAnswer ? 1 : 0); // ANCOUNT
  // NS/AR = 0

  // Question: QNAME + QTYPE=CNAME(5) + QCLASS=IN(1)
  const question = new Uint8Array(qnameBytes.length + 4);
  question.set(qnameBytes, 0);
  const qdv = new DataView(question.buffer);
  qdv.setUint16(qnameBytes.length, 5);
  qdv.setUint16(qnameBytes.length + 2, 1);

  let answer = new Uint8Array(0);
  if (includeAnswer) {
    // NAME pointer to offset 12 (start of QNAME): 0xC00C
    const namePtr = Uint8Array.from([0xc0, 0x0c]);
    const fixed = new Uint8Array(10); // TYPE(2) CLASS(2) TTL(4) RDLENGTH(2)
    const fdv = new DataView(fixed.buffer);
    fdv.setUint16(0, ansType); // TYPE
    fdv.setUint16(2, 1); // IN
    fdv.setUint32(4, 300); // TTL
    let rdata;
    if (ansType === 5) {
      rdata = targetBytes;
    } else if (ansType === 1) { // A
      rdata = Uint8Array.from([1, 2, 3, 4]);
    } else {
      rdata = Uint8Array.from([0]);
    }
    fdv.setUint16(8, rdata.length); // RDLENGTH
    answer = new Uint8Array(namePtr.length + fixed.length + rdata.length);
    answer.set(namePtr, 0);
    answer.set(fixed, namePtr.length);
    answer.set(rdata, namePtr.length + fixed.length);
  }

  const buf = new Uint8Array(header.length + question.length + answer.length);
  buf.set(header, 0);
  buf.set(question, header.length);
  buf.set(answer, header.length + question.length);

  return {
    ok,
    arrayBuffer: async () => buf.buffer,
  };
}

describe('dns tests', () => {
  let origFetch;
  let origBuffer;
  let origBtoa;

  beforeEach(() => {
    origFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
    if (origBuffer !== undefined) {
      // eslint-disable-next-line no-global-assign
      Buffer = origBuffer;
      origBuffer = undefined;
    }
    if (origBtoa !== undefined) {
      global.btoa = origBtoa;
      origBtoa = undefined;
    }
  });

  it('resolves via DoH when tryNative=false and CNAME matches', async () => {
    const target = 'ref--site--org.domains.aem.network.';
    global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', cnameTarget: target });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, 'ref--site--org.domains.aem.network');
  });

  it('returns null for DoH non-matching CNAME', async () => {
    const target = 'not-matching.example.com.';
    global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', cnameTarget: target });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, null);
  });

  it('returns null when DoH returns no answers', async () => {
    global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', includeAnswer: false });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, null);
  });

  it('returns null when DoH answer is not a CNAME', async () => {
    global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', cnameTarget: 'ignored.', ansType: 1 });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, null);
  });

  it('returns null when DoH !ok', async () => {
    global.fetch = async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, null);
  });

  it('falls back to DoH if node:dns fails', async () => {
    const dns = await import('node:dns');
    const orig = dns.promises.resolve;
    dns.promises.resolve = async () => {
      throw new Error('boom');
    };
    try {
      const target = 'ref--site--org.domains.aem.network.';
      global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', cnameTarget: target });
      const cname = await resolveCustomDomain('foo.example.com', true);
      assert.strictEqual(cname, 'ref--site--org.domains.aem.network');
    } finally {
      dns.promises.resolve = orig;
    }
  });

  it('uses node:dns path when tryNative=true and returns first CNAME', async () => {
    const dns = await import('node:dns');
    const orig = dns.promises.resolve;
    dns.promises.resolve = async () => ['ref--site--org.domains.aem.network.'];
    try {
      const cname = await resolveCustomDomain('foo.example.com', true);
      assert.strictEqual(cname, 'ref--site--org.domains.aem.network');
    } finally {
      dns.promises.resolve = orig;
    }
  });

  it('covers b64url fallback branch (no Buffer, with btoa)', async () => {
    origBuffer = Buffer; // capture original
    // eslint-disable-next-line no-undef
    // @ts-ignore
    // eslint-disable-next-line no-global-assign
    Buffer = undefined; // force fallback
    origBtoa = global.btoa;
    global.btoa = (s) => origBuffer.from(s, 'binary').toString('base64');
    const target = 'ref--site--org.domains.aem.network.';
    global.fetch = async () => makeDohResponse({ qname: 'foo.example.com.', cnameTarget: target });
    const cname = await resolveCustomDomain('foo.example.com', false);
    assert.strictEqual(cname, 'ref--site--org.domains.aem.network');
  });
});
