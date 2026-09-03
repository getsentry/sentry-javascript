export type SentryRemixVitePluginOptions = {
  /**
   * Path to the app directory (where routes folder is located).
   * Can be relative to project root or absolute.
   * Defaults to 'app' in the project root.
   *
   * @example './app'
   * @example '/absolute/path/to/app'
   */
  appDirPath?: string;

  /**
   * Build-time instrumentation of server-side dependencies (e.g. `mysql`, `ioredis`,
   * `@remix-run/server-runtime`): the plugin injects `diagnostics_channel` publishers into the
   * bundled SSR output, so the SDK traces them without monkey-patching.
   *
   * Set to `false` to opt out.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
};
