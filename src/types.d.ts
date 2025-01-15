import type { ExecutionContext, KVNamespace } from "@cloudflare/workers-types/experimental";
import type { HTMLTemplate } from "./templates/html/HTMLTemplate.js";
import { JSONTemplate } from "./templates/json/JSONTemplate.js";

declare global {
  /**
   * { pathPattern => Config }
   */
  export type ConfigMap = Record<string, Config>;

  export interface AttributeOverrides {
    variant: {
      // expected attribute name => actual attribute name
      [key: string]: string;
    };
    product: {
      // expected attribute name => actual attribute name
      [key: string]: string;
    }
  }

  /**
   * Resolved config object
   */
  export interface Config {
    org: string;
    site: string;
    siteKey: string;
    origin?: string;
    pathname: string;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;

    // KV namespaces
    CONFIGS: KVNamespace<string>;

    [key: string]: string | KVNamespace<string> | R2Bucket;
  }

  export interface Context extends ExecutionContext {
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    info: {
      method: string;
      headers: Record<string, string>;
    }
  }
}

export { };