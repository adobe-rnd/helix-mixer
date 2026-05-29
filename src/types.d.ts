import type { ExecutionContext, KVNamespace, Fetcher } from "@cloudflare/workers-types/experimental";

declare global {
  export interface BackendConfig {
    origin: string;
    pathPrefix?: string;
    path?: string;
    protocol?: "http" | "https";
    // additional headers to set on the backend request
    headers?: Record<string, string>;
    // per-origin overrides, keyed by the incoming request's origin (x-forwarded-host/host).
    // The matched override is merged into the backend config, so any backend property
    // can be overridden (currently only `headers` is used).
    originOverrides?: Record<string, Partial<BackendConfig>>;
  }

  export interface RawConfig {
    // path pattern -> backend ID
    patterns: Record<string, string>;
    // backend ID -> backend configs
    backends: Record<string, BackendConfig>;
    // inlines
    inlineNav?: boolean;
    inlineFooter?: boolean;
    inlineFragments?: {
      paths?: string[];
    };
  }

  /**
   * Resolved config object
   */
  export interface Config extends RawConfig {
    org: string;
    site: string;
    ref: string;
    siteKey: string;
    pattern: string;
    backend: BackendConfig;
    protocol: string;
    origin: string;
    pathname: string;
  }

  export interface Env {
    VERSION: Promise<string>;
    ENVIRONMENT: Promise<string>;
    DEV: Promise<string | undefined>;
    PRODUCT_PIPELINE_TOKEN: Promise<string>;

    // KV namespaces
    CONFIGS: KVNamespace<string>;

    [key: string]: Promise<string> | KVNamespace<string> | R2Bucket;
  }

  export interface Context {
    executionContext: ExecutionContext
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    // TODO: remove this
    storage: KVNamespace;
    /** { ref--site--org => mtls fetcher } */
    CERT: Record<string, Fetcher>;
    info: {
      method: string;
      headers: Record<string, string>;
      subdomain: string;
      body: ReadableStream<any> | null;
    }
  }
}

export { };