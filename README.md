# helix-mixer

A universal edge service (Cloudflare Workers + Fastly Compute@Edge) that acts as a smart reverse proxy for Edge Delivery Services in Adobe Experience Manager Sites as a Cloud Service with document-based authoring sites, routing requests to different backends based on configurable URL patterns.

## Overview

helix-mixer is part of the Adobe Helix ecosystem, providing dynamic content routing and backend mixing capabilities. It fetches configuration from AEM Live sites and routes incoming requests to appropriate backend services based on URL path patterns.

## How it Works

1. **Request Processing**: Incoming requests are analyzed to extract organization, site, and reference information from the subdomain
2. **Configuration Fetching**: Service retrieves routing configuration from `https://{ref}--{site}--{org}.aem.live/config.json`
3. **Pattern Matching**: URL paths are matched against configured glob patterns to determine the target backend
4. **Request Proxying**: Requests are forwarded to the matched backend with optional path transformations

## Endpoints

All requests are proxied based on the configured patterns. The service itself doesn't expose specific API endpoints but rather acts as a transparent proxy.

### URL Structure
```
https://{ref}--{site}--{org}.aem.network/{path}
```

Where:
- `{ref}`: Branch/reference (e.g., `main`, `preview`)
- `{site}`: Site identifier 
- `{org}`: Organization identifier
- `{path}`: Request path to be routed

## Configuration Format

Configuration is fetched from `https://{ref}--{site}--{org}.aem.live/config.json` and should be structured as follows:

```json
{
  "public": {
    "mixerConfig": {
      "patterns": {
        "/graphql/**": "commerce-backend",
        "/api/catalog/**": "commerce-backend",
        "/blog/**": "legacy-cms-backend",
        "default": "main-backend"
      },
      "backends": {
        "commerce-backend": {
          "origin": "commerce.example.com",
          "protocol": "https"
        },
        "legacy-cms-backend": {
          "origin": "legacy-blog.example.com",
          "path": "/wp-content"
        },
        "main-backend": {
          "origin": "main--site--org.aem.live"
        }
      }
    }
  }
}
```

### Configuration Schema

#### `patterns` (Required)
Maps URL path patterns to backend identifiers using glob syntax:
- `*`: Matches any characters within a path segment (excluding `/`)
- `**`: Matches any characters across multiple path segments
- `default`: Fallback backend when no pattern matches
- Patterns are matched by specificity (longest pattern first)

#### `backends` (Required)
Defines backend configurations:
- `origin` (required): Target hostname or URL
- `protocol` (optional): `"http"` or `"https"`, defaults to `"https"`
- `path` (optional): Base path to prepend to forwarded requests

### Example Routing

With the above configuration:
- `GET /graphql` → routed to `https://commerce.example.com/graphql`
- `POST /api/catalog/search` → routed to `https://commerce.example.com/api/catalog/search`
- `GET /blog/latest-posts` → routed to `https://legacy-blog.example.com/wp-content/blog/latest-posts`
- `GET /about` → routed to `https://main--site--org.aem.live/about` (default)

## Special Features

### Magento Cloud Integration
- Backends with origins ending in `.magento.cloud` automatically use mTLS authentication
- Certificates are managed through Cloudflare environment variables prefixed with `CERT_`

### Adobe Commerce Pipeline Support
- Requests to `pipeline-cloudflare.adobecommerce.live` receive automatic authentication
- Adds `x-auth-token` header using `PRODUCT_PIPELINE_TOKEN` environment variable
- Injects `x-robots-tag: noindex, nofollow` for non-forwarded hosts

### Fallback Behavior
- If configuration fetch fails, service continues with empty patterns/backends
- Missing backends automatically fallback to `{ref}--{site}--{org}.aem.live`
- All requests are proxied with cache disabled (`cacheEverything: false`)

### DNS Lookup (Custom Domains)
- All edge runtimes use DNS-over-HTTPS (RFC 8484) with GET requests to `/dns-query?dns=...`
- Leverages dynamic backends to DNS providers (`dns.google`, `1.1.1.1`) for cacheability and performance
- DNS requests race between multiple providers for optimal latency

## Development

### Prerequisites
- Node.js 18+
- npm or equivalent package manager
- Wrangler CLI for Cloudflare Workers (optional, for local dev)
- helix-deploy (installed via devDependencies) for universal build/deploy

### Setup
```bash
npm install
```

### Available Scripts
- `npm run dev` - Start local Cloudflare dev server (requires `.dev.vars`)
- `npm run build` - Build the worker bundle for Cloudflare
- `npm test` - Run unit tests with coverage
- `npm run lint` - Run ESLint
- `npm run fastly-build` - Build universal edge bundle with helix-deploy (hedy)
- `npm run deploy:edge` - Deploy to Cloudflare and Fastly using helix-deploy + plugin-edge
- `npm run deploy:dev|deploy:ci|deploy:production` - Legacy Cloudflare-only deploys via wrangler

### Environment Variables
Create a `.dev.vars` file for local development:
```
REF=main
SITE=your-site
ORG=your-org
PRODUCT_PIPELINE_TOKEN=your-token
```

### Testing
```bash
npm test
```

## Deployment

### Universal Edge (recommended)
- Uses `@adobe/helix-deploy` with `@adobe/helix-deploy-plugin-edge` to package and deploy for both providers.
- GitHub Actions workflows `build-edge` (for branches) and `semantic-release-edge` (for `main`) run tests, build, deploy, and execute post‑deploy tests.

Required GitHub secrets (ask maintainers for values):
- `HLX_FASTLY_CI_ID`, `HLX_FASTLY_CI_AUTH` (for CI deployments) and `HLX_FASTLY_AUTH` (for release)
- `HLX_CLOUDFLARE_EMAIL`, `HLX_CLOUDFLARE_ACCOUNT`, `HLX_CLOUDFLARE_AUTH`

Domains used in post‑deploy tests can be overridden via env:
- `HLX_CLOUDFLARE_CI_DOMAIN`, `HLX_CLOUDFLARE_PROD_DOMAIN`
- `HLX_FASTLY_CI_DOMAIN`, `HLX_FASTLY_PROD_DOMAIN`

### CI/CD
The unified workflow `.github/workflows/main.yaml` runs branch CI (build, deploy, post‑deploy test) and main branch releases.

## License

Licensed under the Apache License, Version 2.0. See the [Apache License](http://www.apache.org/licenses/LICENSE-2.0) for details.
