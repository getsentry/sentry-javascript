import Module, { createRequire } from 'node:module';

// Maps `require('@sentry/node')` to `@sentry/deno` in the Node suite files. ES modules get this
// mapping from the `scopes` of `import-map.json`, but Deno does not apply import maps to
// `require()`, so the CommonJS scenarios need this resolve hook.
const NODE_SUITE_FILE = /[\\/]node-integration-tests[\\/](suites|utils)[\\/]/;
const SENTRY_DENO = createRequire(import.meta.url).resolve('@sentry/deno');

type ResolveFilename = (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string;
const moduleWithResolve = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolveFilename = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (request, parent, ...rest) {
  if (request === '@sentry/node' && NODE_SUITE_FILE.test(parent?.filename ?? '')) {
    return SENTRY_DENO;
  }
  return originalResolveFilename.call(this, request, parent, ...rest);
};
