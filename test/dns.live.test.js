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

describe('dns live tests (Google DoH)', function suite() {
  this.timeout(15000);
  this.retries(2);

  it('returns null for example.com (not an AEM custom domain)', async () => {
    const cname = await resolveCustomDomain('example.com'); // uses DoH
    assert.strictEqual(cname, null);
  });

  it('returns CNAME for www.wagenerbeer.com', async () => {
    const cname = await resolveCustomDomain('www.wagenerbeer.com'); // uses DoH
    assert.strictEqual(cname, 'main--id--davidnuescheler.domains.aem.network');
  });
});
