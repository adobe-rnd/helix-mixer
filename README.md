# helix-mixer

A universal edge service (Cloudflare Workers + Fastly Compute@Edge) that acts as a smart reverse proxy for Edge Delivery Services in Adobe Experience Manager Sites as a Cloud Service with document-based authoring sites, routing requests to different backends based on configurable URL patterns.

## Overview

helix-mixer is part of the Adobe Helix ecosystem, providing dynamic content routing and backend mixing capabilities. It fetches configuration from AEM Live sites and routes incoming requests to appropriate backend services based on URL path patterns.

## How it Works

1. **Request Processing**: Incoming requests are analyzed to extract organization, site, and reference information from the subdomain
2. **Configuration Fetching**: Service retrieves routing configuration from the AEM config service (edge-cached for 60s on both Cloudflare and Fastly, so config changes can take up to ~1 minute per POP to take effect; 404s are cached for only 5s so a newly published config is picked up quickly)
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

Routing configuration is fetched from the AEM config service. The `public.mixerConfig` object holds the routing config and should be structured as follows:

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
          "pathPrefix": "/wp-content"
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
- `origin` (required): Target hostname or URL. May include a path prefix (e.g. `example.com/base`) as an alternative to `pathPrefix`.
- `protocol` (optional): `"http"` or `"https"`, defaults to `"https"`
- `path` (optional): Fixed path sent to the origin — the client's request path is **ignored** and replaced entirely with this value.
- `pathPrefix` (optional): Prefix prepended to the client's request path before forwarding. Unlike `path`, the original request path is preserved and appended after the prefix.
- `headers` (optional): Object of additional request headers to send to the origin. These are applied last and override inbound headers of the same name.
- `originOverrides` (optional): Conditionally override backend properties based on the incoming request's host. See [Origin Overrides](#origin-overrides).

**`path` vs `pathPrefix`**

| Property | Client requests `/foo/bar` | Forwarded path |
|---|---|---|
| `path: "/fixed"` | any path | `/fixed` |
| `pathPrefix: "/base"` | `/foo/bar` | `/base/foo/bar` |

Use `path` when the backend serves a single resource regardless of what the client requested. Use `pathPrefix` when the backend mirrors the same path hierarchy but under a different root.

### Example Routing

With the above configuration:
- `GET /graphql` → routed to `https://commerce.example.com/graphql`
- `POST /api/catalog/search` → routed to `https://commerce.example.com/api/catalog/search`
- `GET /blog/latest-posts` → routed to `https://legacy-blog.example.com/wp-content/blog/latest-posts`
- `GET /about` → routed to `https://main--site--org.aem.live/about` (default)

## Special Features

### Origin Overrides
Backends may define an `originOverrides` map to conditionally override backend properties based on the **incoming** request host (the `x-forwarded-host` header, falling back to `host`):

```json
"commerce-backend": {
  "origin": "commerce.example.com",
  "headers": { "x-env": "default" },
  "originOverrides": {
    "*.staging.example.com": {
      "headers": { "x-env": "staging" }
    }
  }
}
```

- Keys are hostname globs (`*` matches within a single label, `**` matches across labels) matched case-insensitively
- The most specific (longest) matching key wins and is shallow-merged onto the backend
- Useful for varying upstream headers per client-facing domain without defining separate backends

### Adobe Commerce Pipeline Support
- Requests to `pipeline-cloudflare.adobecommerce.live` receive automatic authentication
- Adds `x-auth-token` header using the `PRODUCT_PIPELINE_TOKEN` environment variable
- Injects `x-robots-tag: noindex, nofollow` when the request has no `x-forwarded-host` header
- Cloudflare string env bindings may be exposed asynchronously by edge adapters, so mixer awaits token/config/dev env values before using them

### Content Images
- Requests whose path contains `/content-images/media_` are always routed to `{ref}--{site}--{org}.aem.live`, regardless of configured patterns

### ACME / TLS Certificate Provisioning
- `GET /.well-known/acme-challenge/{token}` is answered directly to support Let's Encrypt HTTP-01 challenges for custom domains
- The response is `{token}.{thumbprint}`, where the thumbprint comes from the `LETSENCRYPT_ACCOUNT_THUMBPRINT` environment variable

### Fallback Behavior
- If the config fetch returns 404, the service continues with empty patterns/backends
- Missing backends automatically fall back to `{ref}--{site}--{org}.aem.live`
- All requests are proxied with cache disabled (`cacheEverything: false`, `cacheTtl: 0`)
- `accept-encoding` is forced to `gzip, deflate` to prevent brotli cache poisoning

### DNS Lookup (Custom Domains)
- Custom domains (any host not ending in a known service domain such as `.aem.network`, `.aem-mesh.live`, or `.workers.dev`) are resolved to their network origin via a CNAME lookup
- All edge runtimes use DNS-over-HTTPS (RFC 8484) with GET requests to `/dns-query?dns=...`
- DNS requests race between multiple providers (`1.1.1.1`, `dns.google`) for optimal latency
- On CI service hosts, an `x-custom-domain` request header forces custom-domain resolution for testing

### Timeouts and Upstream Errors

Every subrequest has a timeout. Each timeout is also capped by a **30s overall deadline** that starts when the request is received, so slow subrequests can't add up past it (for example, after a 12s config fetch the backend gets at most 18s). Once the deadline has passed, remaining subrequests aren't sent.

| Subrequest | Timeout | On timeout or network error |
|---|---|---|
| Config fetch | 15s | `502`, `x-error: config fetch timeout (config.aem.page) after 15000ms` or `config fetch error (config.aem.page): {message}` |
| Backend fetch | 30s | `502`, `x-error: backend fetch timeout ({host}) after 30000ms` or `backend fetch error ({host}): {message}` |
| Inline fragment / header / footer | 15s | The inline is skipped and the page is served uncacheable (`cache-control: private, no-store`, CDN cache headers removed) with `x-inline-error: fragment fetch timeout ({path}) after 15000ms` (or `header` / `footer`, `fetch error`, or `skipped ({path}): request deadline exceeded`) |
| DoH CNAME lookup | 5s | The lookup is treated as failed (no CNAME) |

- An upstream 5xx from the config service returns `502` with `x-error: config fetch failed (config.aem.page): {status}`; 4xx keeps its status.
- Backend responses, including 5xx, are passed through unchanged.
- `500` means an error in the mixer itself; `502` means an upstream problem.
- Mixer-generated `502`s carry `cache-control: private, no-store`, so downstream caches don't keep a transient upstream error.
- Bodies the mixer buffers are covered by the timeout too: the config JSON, inlined fragment / header / footer bodies, and the backend page when inlines are configured (a stall or failure there returns `502`). A backend body that is streamed through isn't covered: once its headers are sent, a stall can't become a `502`.
- Fastly Compute has no `AbortController`, so the timeout is enforced with `setTimeout` and `Promise.race`; where `AbortController` exists (Cloudflare), the subrequest is also aborted.
- Each timeout is logged with the upstream host, the elapsed time and the request ID (Fastly trace ID or Cloudflare ray ID).

## Development

### Prerequisites
- Node.js 18+
- npm or equivalent package manager
- Wrangler CLI for Cloudflare Workers (installed via devDependencies)
- Fastly CLI for Fastly Compute (install separately: `brew install fastly`)
- helix-deploy (installed via devDependencies) for universal build/deploy

### Setup
```bash
npm install
```

### Local Development

Run both edge runtimes locally in parallel:

```bash
npm run dev
```

This starts:
- **Cloudflare Workers** dev server on the default Wrangler port
- **Fastly Compute** local server on http://127.0.0.1:7676

Or run them individually:
```bash
npm run dev:cloudflare  # Cloudflare Workers only
npm run dev:fastly      # Fastly Compute only
```

### Remote Development (CI Services)

Monitor live CI deployments by tailing logs from both services:

```bash
npm run tail
```

This tails logs from:
- **Cloudflare CI**: `cloudflareci.aem-mesh.live`
- **Fastly CI**: `fastlyci.aem.network`

Or tail logs individually:
```bash
npm run tail:cloudflare  # Cloudflare CI logs only
npm run tail:fastly      # Fastly CI logs only
```

#### CI Service URLs

Test the CI deployments at:
- Cloudflare: `https://{ref}--{site}--{org}.cloudflareci.aem-mesh.live`
- Fastly: `https://{ref}--{site}--{org}.fastlyci.aem.network`

Example: `https://main--helix-website--adobe.cloudflareci.aem-mesh.live/`

### Building

```bash
npm run build  # Build universal edge bundle for both Cloudflare and Fastly
```

### Testing

```bash
npm test              # Run unit tests with coverage
npm run lint          # Run ESLint
npm run test-postdeploy  # Run post-deployment tests against CI services
```

## Deployment

### Universal Edge (recommended)
- Uses `@adobe/helix-deploy` (the `hedy` CLI) to package and deploy for both providers in one build.
- Deploy manually with `npm run deploy:ci` or `npm run deploy:production`.

Required GitHub secrets (ask maintainers for values):
- `HLX_FASTLY_CI_ID`, `HLX_FASTLY_CI_AUTH` (for CI deployments); `HLX_FASTLY_ID`, `HLX_FASTLY_AUTH` (for release)
- `HLX_CLOUDFLARE_EMAIL`, `HLX_CLOUDFLARE_ACCOUNT`, `HLX_CLOUDFLARE_AUTH`
- `LETSENCRYPT_ACCOUNT_THUMBPRINT` (for ACME challenge responses)
- `POST_DEPLOY_SITE_NAME` (target site name for post‑deploy tests)

Post‑deploy tests run against the CI domains by default; set `TEST_PRODUCTION=true` to run them against production domains.

### CI/CD
The unified workflow `.github/workflows/main.yaml` runs lint + unit tests on every push, deploys branches to CI (with post‑deploy tests), and runs semantic-release on `main`.

## License

Licensed under the Apache License, Version 2.0. See the [Apache License](http://www.apache.org/licenses/LICENSE-2.0) for details.
