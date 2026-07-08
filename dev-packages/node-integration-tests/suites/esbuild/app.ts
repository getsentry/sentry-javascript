import * as Sentry from '@sentry/node';

// `@sentry/node` is `sideEffects: false`, so esbuild only evaluates the
// module if we reference an export.
//  a module-scope `createRequire(import.meta.url)` throws
// in a CJS bundle, because esbuild rewrites `import.meta.url` to `{}`,
// so it becomes `createRequire(undefined)`, which would break apps that
// do not opt into orchestrion.
// eslint-disable-next-line no-console
console.log(`SENTRY_NODE_LOADED typeof_init=${typeof Sentry.init}`);
