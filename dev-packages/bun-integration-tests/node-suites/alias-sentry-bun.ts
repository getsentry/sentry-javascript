import { plugin } from 'bun';
import Module from 'node:module';

// Maps `@sentry/node` to `@sentry/bun` in the Node suite files. `@sentry/bun` imports
// `@sentry/node` itself, so imports from outside the Node suite files are not touched.
const NODE_SUITE_FILE = /[\\/]node-integration-tests[\\/](suites|utils)[\\/]/;

// Bun's runtime `onResolve` does not see bare package specifiers, so ES modules are rewritten on
// load. `onLoad` output for a CommonJS file does not run, so those files keep their source.
const NODE_SUITE_ESM_FILE = /[\\/]node-integration-tests[\\/](suites|utils)[\\/](?!\bnode_modules\b).*\.(mjs|ts)$/;
const SENTRY_NODE_SPECIFIER = /(['"])@sentry\/node\1/g;

plugin({
  name: 'alias-sentry-node-to-sentry-bun',
  setup(build) {
    build.onLoad({ filter: NODE_SUITE_ESM_FILE }, async args => {
      const source = await Bun.file(args.path).text();
      return {
        contents: source.replace(SENTRY_NODE_SPECIFIER, '$1@sentry/bun$1'),
        loader: args.path.endsWith('.ts') ? 'ts' : 'js',
      };
    });
  },
});

type ResolveFilename = (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string;
const moduleWithResolve = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolveFilename = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (request, parent, ...rest) {
  const aliased = request === '@sentry/node' && NODE_SUITE_FILE.test(parent?.filename ?? '') ? '@sentry/bun' : request;
  return originalResolveFilename.call(this, aliased, parent, ...rest);
};
