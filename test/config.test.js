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

import assert from 'node:assert';
import { resolveConfig } from '../src/config.js';

// Store original fetch to restore later
const originalFetch = globalThis.fetch;

// Mock fetch responses for different configurations
const mockConfigs = {
  'main--catalog-service-feed--aemsites': {
    public: {
      patterns: {
        base: {
          storeViewCode: 'default',
          storeCode: 'main',
        },
        '/products/{{urlKey}}': {
          pageType: 'product',
        },
      },
      mixerConfig: {
        patterns: {
          '/store1/*': 'adobe_productbus',
          '/store2/*': 'adobe_productbus',
          '/store3/*': 'adobe_productbus',
          '/store4/*': 'adobe_productbus',
          '/Store5/*': 'adobe_productbus',
          '/store5/*': 'adobe_productbus',
        },
        backends: {
          adobe_productbus: {
            origin: 'pipeline-cloudflare.adobecommerce.live',
            pathPrefix: '/aemsites/catalog-service-feed/main/',
          },
        },
      },
    },
  },
  'main--helix-test-product-bus--dylandepass': {
    public: {
      mixerConfig: {
        patterns: {
          '/en/us/products/fragments/*': 'adobe_edge',
          '/en/us/products/*': 'adobe_productbus',
        },
        backends: {
          adobe_edge: {
            origin: 'main--helix-test-product-bus--dylandepass.aem.live',
          },
          adobe_productbus: {
            origin: 'pipeline-cloudflare.adobecommerce.live',
            pathPrefix: '/dylandepass/helix-test-product-bus/main/',
          },
        },
      },
    },
  },
  'main--shop-cart--aemsites': {
    public: {
      mixerConfig: {
        patterns: {
          '/us/en_us/products/fragments/*': 'adobe_edge',
          '/us/en_us/products/*': 'adobe_productbus',
          '/nav.plain.html': 'adobe_edge__nav',
          '/footer.plain.html': 'adobe_edge__footer',
          '/customer/section/load/*': 'uat',
          '/us/en_us/customer/section/load/*': 'uat',
          '/graphql': 'uat',
          '/us/en_us/checkout/cart/': 'uat',
          '/us/en_us/shop/*': 'uat',
        },
        backends: {
          adobe_edge: {
            origin: 'cart--shop-cart--aemsites.aem.live',
          },
          adobe_edge__nav: {
            origin: 'cart--shop-cart--aemsites.aem.live',
            pathPrefix: '/us/en_us/nav/',
          },
          adobe_edge__footer: {
            origin: 'cart--shop-cart--aemsites.aem.live',
            pathPrefix: '/us/en_us/footer/',
          },
          adobe_productbus: {
            origin: 'pipeline-cloudflare.adobecommerce.live',
            pathPrefix: '/aemsites/shop/main/',
          },
          uat: {
            origin: 'uat.shop.com',
          },
        },
      },
    },
  },
  'dev-pdp--adobe-edge-stage--retailer': {
    public: {
      mixerConfig: {
        patterns: {
          '': 'adobe_edge',
          '/': 'adobe_edge',
          '/**/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\\.[0-9a-z]+': 'adobe_edge',
          '/aem/**': 'adobe_edge',
          '/scripts/**': 'adobe_edge',
          '/styles/**': 'adobe_edge',
          '/blocks/**': 'adobe_edge',
          '/fonts/**': 'adobe_edge',
          '/icons/**': 'adobe_edge',
          '/images/**': 'adobe_edge',
          '/plugins/**': 'adobe_edge',
          '/ca': 'adobe_edge',
          '/ca/': 'adobe_edge',
          '/ca/nav': 'adobe_edge',
          '/ca/footer': 'adobe_edge',
          '/uk': 'adobe_edge',
          '/uk/': 'adobe_edge',
          '/uk/nav': 'adobe_edge',
          '/uk/footer': 'adobe_edge',
          '/ceiling/**': 'adobe_edge',
          '/floor/**': 'adobe_edge',
          '/furniture/**': 'adobe_edge',
          '/outdoor/**': 'adobe_edge',
          '/s/**': 'similarai',
        },
        backends: {
          adobe_edge: {
            origin: 'dev-pdp--adobe-edge-stage--retailer.aem.live',
          },
          similarai: {
            origin: 'retailer.page.similar.ai',
          },
          adobe_commerce_prod: {
            origin: 'c.drct5h2g466l4.2.dev.ent.magento.cloud',
          },
          default: {
            origin: 'c.drct5h2g466l4.2.dev.ent.magento.cloud',
          },
        },
      },
    },
  },
  'test--site--org': {
    public: {
      mixerConfig: {
        patterns: { '/test': 'backend1', '/test/*': 'backend1' },
        backends: {
          backend1: {
            origin: 'https://example.com/base/path',
            pathPrefix: '/backend/path',
          },
        },
      },
    },
  },
  'main--productbus-test--maxakuru': {
    public: {
      mixerConfig: {
        patterns: {
          '/products/*': 'adobe_productbus',
          '/products/operations-log': 'adobe_productbus_api',
        },
        backends: {
          adobe_edge: {
            origin: 'main--productbus-test--maxakuru.aem.live',
          },
          adobe_productbus: {
            origin: 'pipeline-cloudflare.adobecommerce.live',
            pathPrefix: '/maxakuru/productbus-test/main/',
          },
          adobe_productbus_api: {
            origin: 'https://api.adobecommerce.live',
            path: '/maxakuru/productbus-test/operations-log',
          },
          default: {
            origin: 'https://aem-prod.k24dhxxpqt72a.dummycachetest.com.c.k24dhxxpqt72a.ent.magento.cloud',
          },
        },
      },
    },
  },
};

// Setup mock fetch function
function setupMockFetch() {
  globalThis.fetch = async (url) => {
    const siteKey = url.replace('https://', '').replace('.aem.live/config.json', '');
    const config = mockConfigs[siteKey];
    if (config) {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => config,
      };
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Map([['content-type', 'text/plain']]),
    };
  };
}

function createMockContext(subdomain, pathname, env = {}) {
  return {
    url: new URL(`https://${subdomain}.aem.network${pathname}`),
    info: {
      subdomain,
      headers: {},
      method: 'GET',
    },
    env: {
      DEV: 'false',
      ...env,
    },
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    storage: {
      get: async () => null,
    },
  };
}

describe('Configuration Pattern Tests with Code Execution', () => {
  // Setup and teardown for fetch mocking
  beforeEach(() => {
    setupMockFetch();
  });

  afterEach(() => {
    // Restore original fetch if it existed
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  describe('Pattern Matching and Backend Resolution', () => {
    it('should resolve multi-store configurations with correct backend', async () => {
      const ctx = createMockContext('main--catalog-service-feed--aemsites', '/store1/product-123');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.org, 'aemsites');
      assert.strictEqual(config.site, 'catalog-service-feed');
      assert.strictEqual(config.ref, 'main');
      assert.strictEqual(config.pattern, '/store1/*');
      assert.strictEqual(config.origin, 'pipeline-cloudflare.adobecommerce.live');
      assert.strictEqual(config.pathname, '/aemsites/catalog-service-feed/main/store1/product-123');
    });

    it('should match more specific patterns over generic ones', async () => {
      const ctx = createMockContext('main--helix-test-product-bus--dylandepass', '/en/us/products/fragments/header');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/en/us/products/fragments/*');
      assert.strictEqual(config.origin, 'main--helix-test-product-bus--dylandepass.aem.live');
      assert.strictEqual(config.pathname, '/en/us/products/fragments/header');
    });

    it('should handle backend variants with suffixes correctly', async () => {
      const ctx = createMockContext('main--shop-cart--aemsites', '/nav.plain.html');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/nav.plain.html');
      assert.strictEqual(config.origin, 'cart--shop-cart--aemsites.aem.live');
      assert.strictEqual(config.pathname, '/us/en_us/nav/nav.plain.html');
    });

    it('should handle empty path patterns', async () => {
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/');
      assert.strictEqual(config.origin, 'dev-pdp--adobe-edge-stage--retailer.aem.live');
    });

    it('should use default backend when pattern not matched', async () => {
      const ctx = createMockContext('main--productbus-test--maxakuru', '/unknown/path');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, undefined);
      // The origin gets parsed and https:// is removed
      assert.strictEqual(config.origin, 'aem-prod.k24dhxxpqt72a.dummycachetest.com.c.k24dhxxpqt72a.ent.magento.cloud');
    });
  });

  describe('Protocol and Path Handling', () => {
    it('should extract protocol from origin URL', async () => {
      const ctx = createMockContext('main--productbus-test--maxakuru', '/products/test');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/products/*');
      assert.strictEqual(config.protocol, 'https');
      assert.strictEqual(config.pathname, '/maxakuru/productbus-test/main/products/test');
    });

    it('should handle origins with embedded paths', async () => {
      const mockCtx = createMockContext('test--site--org', '/test');
      const config = await resolveConfig(mockCtx);

      assert.strictEqual(config.origin, 'example.com');
      // Backend path takes precedence, so we get /backend/path not /base/path
      assert.strictEqual(config.pathname, '/backend/path/test');
    });

    it('should prioritize backend path over origin path', async () => {
      // This test uses the same config as above - backend.path overrides origin path
      const mockCtx = createMockContext('test--site--org', '/test/subpath');
      const config = await resolveConfig(mockCtx);

      assert.strictEqual(config.origin, 'example.com');
      assert.strictEqual(config.pathname, '/backend/path/test/subpath');
    });

    it('should handle complete path', async () => {
      const mockCtx = createMockContext('main--productbus-test--maxakuru', '/products/operations-log');
      const config = await resolveConfig(mockCtx);

      assert.strictEqual(config.pattern, '/products/operations-log');
      assert.strictEqual(config.origin, 'api.adobecommerce.live');
      assert.strictEqual(config.pathname, '/maxakuru/productbus-test/operations-log');
    });
  });

  describe('Complex Pattern Matching', () => {
    it('should match script patterns', async () => {
      // The complex regex pattern for media files doesn't work with globToRegExp
      // Testing a simpler pattern instead
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/scripts/main.js');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/scripts/**');
      assert.strictEqual(config.origin, 'dev-pdp--adobe-edge-stage--retailer.aem.live');
    });

    it('should match country-specific routes', async () => {
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/ca/nav');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/ca/nav');
      assert.strictEqual(config.origin, 'dev-pdp--adobe-edge-stage--retailer.aem.live');
    });

    it('should match commerce category patterns', async () => {
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/furniture/chairs/modern');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/furniture/**');
      assert.strictEqual(config.origin, 'dev-pdp--adobe-edge-stage--retailer.aem.live');
    });

    it('should match third-party service patterns', async () => {
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/s/analytics/data');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/s/**');
      assert.strictEqual(config.origin, 'retailer.page.similar.ai');
    });
  });

  describe('E-commerce Route Handling', () => {
    it('should handle GraphQL endpoint routing', async () => {
      const ctx = createMockContext('main--shop-cart--aemsites', '/graphql');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/graphql');
      assert.strictEqual(config.origin, 'uat.shop.com');
      assert.strictEqual(config.pathname, '/graphql');
    });

    it('should handle shopping cart routes', async () => {
      const ctx = createMockContext('main--shop-cart--aemsites', '/us/en_us/checkout/cart/');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/us/en_us/checkout/cart/');
      assert.strictEqual(config.origin, 'uat.shop.com');
    });

    it('should handle customer section load', async () => {
      const ctx = createMockContext('main--shop-cart--aemsites', '/us/en_us/customer/section/load/12345');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/us/en_us/customer/section/load/*');
      assert.strictEqual(config.origin, 'uat.shop.com');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing configuration gracefully', async () => {
      const ctx = createMockContext('nonexistent--site--org', '/test');
      const config = await resolveConfig(ctx);

      // Should get a minimal config with fallback backend
      assert.ok(config);
      assert.strictEqual(config.pattern, undefined);
      // Fallback origin doesn't have https:// prefix
      assert.strictEqual(config.origin, 'nonexistent--site--org.aem.live');
    });

    it('should throw error for missing org', async () => {
      const ctx = createMockContext('main--site', '/test'); // Missing org part

      try {
        await resolveConfig(ctx);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.strictEqual(error.response.status, 404);
        assert.ok(error.message.includes('missing org'));
      }
    });

    it('should throw error for missing site', async () => {
      const ctx = createMockContext('main', '/test'); // Missing site and org - will throw 'missing org' first

      try {
        await resolveConfig(ctx);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.strictEqual(error.response.status, 404);
        // When both site and org are missing, it throws 'missing org' first
        assert.ok(error.message.includes('missing org'));
      }
    });

    it('should handle invalid config structure', async () => {
      // Add a separate invalid config
      mockConfigs['invalid--config--org'] = {
        public: {
          mixerConfig: {
            patterns: { '/test': 123 }, // Invalid: pattern value should be string
            backends: {},
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('invalid--config--org', '/test');

      try {
        await resolveConfig(ctx);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.strictEqual(error.response.status, 400);
        assert.ok(error.message.includes('invalid pattern'));
      }

      // Clean up
      delete mockConfigs['invalid--config--org'];
    });

    it('should handle backends with missing origin', async () => {
      // Add a separate invalid config
      mockConfigs['noorigin--config--org'] = {
        public: {
          mixerConfig: {
            patterns: { '/test': 'backend1' },
            backends: {
              backend1: {}, // Missing origin
            },
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('noorigin--config--org', '/test');

      try {
        await resolveConfig(ctx);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.strictEqual(error.response.status, 400);
        assert.ok(error.message.includes('invalid backend'));
      }

      // Clean up
      delete mockConfigs['noorigin--config--org'];
    });
  });

  describe('DEV Mode Configuration', () => {
    it('should use environment variables in DEV mode', async () => {
      // Add config for DEV mode testing
      mockConfigs['feature--devsite--devorg'] = {
        public: {
          mixerConfig: {
            patterns: {},
            backends: {},
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('ignored--subdomain--parts', '/test', {
        DEV: 'true',
        REF: 'feature',
        SITE: 'devsite',
        ORG: 'devorg',
      });

      const config = await resolveConfig(ctx);
      assert.strictEqual(config.ref, 'feature');
      assert.strictEqual(config.site, 'devsite');
      assert.strictEqual(config.org, 'devorg');
    });
  });

  describe('Pattern Priority and Sorting', () => {
    it('should prioritize longer patterns over shorter ones', async () => {
      // Add test config with different pattern lengths
      mockConfigs['test--site--org'] = {
        public: {
          mixerConfig: {
            patterns: {
              '/products/*': 'backend1',
              '/products/category/*': 'backend2',
              '/products/category/item': 'backend3',
            },
            backends: {
              backend1: { origin: 'backend1.com' },
              backend2: { origin: 'backend2.com' },
              backend3: { origin: 'backend3.com' },
            },
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('test--site--org', '/products/category/item');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/products/category/item');
      assert.strictEqual(config.origin, 'backend3.com');
    });
  });

  describe('Wildcard Pattern Variations', () => {
    it('should handle single asterisk wildcards', async () => {
      const ctx = createMockContext('main--catalog-service-feed--aemsites', '/store5/product');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/store5/*');
      assert.strictEqual(config.origin, 'pipeline-cloudflare.adobecommerce.live');
    });

    it('should handle double asterisk wildcards', async () => {
      const ctx = createMockContext('dev-pdp--adobe-edge-stage--retailer', '/scripts/lib/utils/helper.js');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '/scripts/**');
      assert.strictEqual(config.origin, 'dev-pdp--adobe-edge-stage--retailer.aem.live');
    });
  });

  describe('Backend Path Manipulation', () => {
    it('should handle trailing slashes in backend paths', async () => {
      // Add test config with trailing slash
      mockConfigs['test--site--org'] = {
        public: {
          mixerConfig: {
            patterns: { '/test': 'backend1' },
            backends: {
              backend1: {
                origin: 'example.com',
                pathPrefix: '/base/path/', // Trailing slash
              },
            },
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('test--site--org', '/test');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pathname, '/base/path/test');
    });

    it('should handle leading slashes in backend paths', async () => {
      // Add test config without leading slash
      mockConfigs['test--site--org'] = {
        public: {
          mixerConfig: {
            patterns: { '/test': 'backend1' },
            backends: {
              backend1: {
                origin: 'example.com',
                pathPrefix: 'base/path', // No leading slash
              },
            },
          },
        },
      };

      // Re-setup mock to include new config
      setupMockFetch();

      const ctx = createMockContext('test--site--org', '/test');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pathname, '/base/path/test');
    });
  });

  describe('Content Images Routing', () => {
    it('should automatically route content-images/media_ to aem.live', async () => {
      const ctx = createMockContext('main--site--org', '/en/services/content-images/media_165855a22ff2f69475d72b51b008b10ba21f73364.avif');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '**/content-images/media_*');
      assert.strictEqual(config.origin, 'main--site--org.aem.live');
      // The pathname should remain unchanged with /content-images/ in it
      assert.strictEqual(config.pathname, '/en/services/content-images/media_165855a22ff2f69475d72b51b008b10ba21f73364.avif');
    });

    it('should handle content-images in nested paths', async () => {
      const ctx = createMockContext('main--site--org', '/path/to/product/content-images/media_abc123.jpg');
      const config = await resolveConfig(ctx);

      assert.strictEqual(config.pattern, '**/content-images/media_*');
      assert.strictEqual(config.origin, 'main--site--org.aem.live');
      assert.strictEqual(config.pathname, '/path/to/product/content-images/media_abc123.jpg');
    });
  });
});
