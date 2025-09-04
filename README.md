# helix-mixer

A Cloudflare Worker service that acts as a smart reverse proxy for Edge Delivery Services in Adobe Experience Manager Sites as a Cloud Service with document-based authoring sites, routing requests to different backends based on configurable URL patterns.

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

## Development

### Prerequisites
- Node.js 18+
- npm or equivalent package manager
- Wrangler CLI for Cloudflare Workers

### Setup
```bash
npm install
```

### Available Scripts
- `npm run dev` - Start local development server (requires `.dev.vars`)
- `npm run build` - Build the worker
- `npm test` - Run test suite with coverage
- `npm run lint` - Run ESLint
- `npm run deploy:dev` - Deploy to development environment
- `npm run deploy:ci` - Deploy to CI environment  
- `npm run deploy:production` - Deploy to production

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

The service is deployed to Cloudflare Workers across three environments:

- **Development**: `helix-mixer-dev.workers.dev`
- **CI**: `helix-mixer-ci.workers.dev`  
- **Production**: `helix-mixer.workers.dev`

Deployment uses semantic-release for automated versioning and is triggered via GitHub Actions.

## License

Licensed under the Apache License, Version 2.0. See the [Apache License](http://www.apache.org/licenses/LICENSE-2.0) for details.