import type { defineConfig } from '@solidjs/start/config';
// Types to avoid pulling in extra dependencies
// These are non-exhaustive
export type Nitro = {
  options: {
    buildDir: string;
    output: {
      serverDir: string;
    };
    preset: string;
  };
};

export type SolidStartInlineConfig = Parameters<typeof defineConfig>[0];

export type SolidStartInlineConfigNitroHooks = {
  hooks?: {
    close?: () => unknown;
    'rollup:before'?: (nitro: Nitro) => unknown;
  };
};

export type SentrySolidStartConfigOptions = {
  /**
   * Enabling basic server tracing can be used for environments where modifying the node option `--import` is not possible.
   * However, enabling this option only supports limited tracing instrumentation. Only http traces will be collected (but no database-specific traces etc.).
   *
   * If this option is `true`, the Sentry SDK will import the instrumentation.server.ts|js file at the top of the server entry file to load the SDK on the server.
   *
   * **DO NOT** enable this option if you've already added the node option `--import` in your node start script. This would initialize Sentry twice on the server-side and leads to unexpected issues.
   *
   * @default false
   */
  experimental_basicServerTracing?: boolean;
};
