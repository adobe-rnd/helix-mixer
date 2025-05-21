import type { ExecutionContext, KVNamespace, Fetcher } from "@cloudflare/workers-types/experimental";
import type { HTMLTemplate } from "./templates/html/HTMLTemplate.js";
import { JSONTemplate } from "./templates/json/JSONTemplate.js";

declare global {
  export interface BackendConfig {
    origin: string;
  }

  export interface RawConfig {
    // path pattern -> backend ID
    patterns: Record<string, string>;
    // backend ID -> backend configs
    backends: Record<string, BackendConfig>;
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
    origin: string;
    pathname: string;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    DEV: string | undefined;

    // KV namespaces
    CONFIGS: KVNamespace<string>;

    [key: string]: string | KVNamespace<string> | R2Bucket;
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
    }
  }
}

export { };