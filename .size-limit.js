const builtinModules = require('module').builtinModules;
const nodePrefixedBuiltinModules = builtinModules.map(m => `node:${m}`);

module.exports = [
  // Browser SDK (ESM)
  {
    name: '@sentry/browser',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init'),
    gzip: true,
  },
  {
    name: '@sentry/browser - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init'),
    gzip: true,
    define: {
      __SENTRY_DEBUG__: false,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
    },
  },
  {
    name: '@sentry/browser - with treeshaking flags tracing without tracing',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init'),
    gzip: true,
    define: {
      __SENTRY_DEBUG__: false,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
      __SENTRY_TRACING__: false,
    },
  },
  {
    name: '@sentry/browser (incl. Tracing)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Tracing + Span Streaming)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'spanStreamingIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Tracing, Profiling)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'browserProfilingIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay) - with treeshaking flags',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration'),
    gzip: true,
    define: {
      __SENTRY_DEBUG__: false,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
    },
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay with Canvas)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'replayCanvasIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Tracing, Replay, Feedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'browserTracingIntegration', 'replayIntegration', 'feedbackIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Feedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'feedbackIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. sendFeedback)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'sendFeedback'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. FeedbackAsync)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'feedbackAsyncIntegration'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Metrics)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'metrics'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Logs)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'logger'),
    gzip: true,
  },
  {
    name: '@sentry/browser (incl. Metrics & Logs)',
    path: 'packages/browser/build/npm/esm/prod/index.js',
    import: createImport('init', 'metrics', 'logger'),
    gzip: true,
  },
  // React SDK (ESM)
  {
    name: '@sentry/react',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
  },
  {
    name: '@sentry/react (incl. Tracing)',
    path: 'packages/react/build/esm/index.js',
    import: createImport('init', 'ErrorBoundary', 'reactRouterV6BrowserTracingIntegration'),
    ignore: ['react/jsx-runtime'],
    gzip: true,
  },
  // Vue SDK (ESM)
  {
    name: '@sentry/vue',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
  },
  {
    name: '@sentry/vue (incl. Tracing)',
    path: 'packages/vue/build/esm/index.js',
    import: createImport('init', 'browserTracingIntegration'),
    gzip: true,
  },
  // Svelte SDK (ESM)
  {
    name: '@sentry/svelte',
    path: 'packages/svelte/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
  },
  // Remix 3 browser SDK (ESM)
  {
    // Every export, not a named import: Remix 3 has no bundler, so an app ships every byte of this
    // file. The budget is what keeps `src/v3/index.client.ts` a named list. One added
    // `export * from '@sentry/browser'` measures 134 KB here, and more on the wire, because a real app
    // has no bundler to shake it.
    name: '@sentry/remix (Remix 3 client bundle)',
    path: 'packages/remix/build/esm/v3/client-bundle.js',
    import: '*',
    gzip: true,
  },
  // Browser CDN bundles
  {
    name: 'CDN Bundle',
    path: createCDNPath('bundle.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing)',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Logs, Metrics)',
    path: createCDNPath('bundle.logs.metrics.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.logs.metrics.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Replay, Logs, Metrics)',
    path: createCDNPath('bundle.replay.logs.metrics.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay)',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.replay.logs.metrics.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback)',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
    gzip: true,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback, Logs, Metrics)',
    path: createCDNPath('bundle.tracing.replay.feedback.logs.metrics.min.js'),
    gzip: true,
  },
  // browser CDN bundles (non-gzipped)
  {
    name: 'CDN Bundle - uncompressed',
    path: createCDNPath('bundle.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing) - uncompressed',
    path: createCDNPath('bundle.tracing.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Replay, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.replay.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.feedback.min.js'),
    gzip: false,
    brotli: false,
  },
  {
    name: 'CDN Bundle (incl. Tracing, Replay, Feedback, Logs, Metrics) - uncompressed',
    path: createCDNPath('bundle.tracing.replay.feedback.logs.metrics.min.js'),
    gzip: false,
    brotli: false,
  },
  // Next.js SDK (ESM)
  {
    name: '@sentry/nextjs (client)',
    path: 'packages/nextjs/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['next/router', 'next/constants'],
    gzip: true,
  },
  // SvelteKit SDK (ESM)
  {
    name: '@sentry/sveltekit (client)',
    path: 'packages/sveltekit/build/esm/client/index.js',
    import: createImport('init'),
    ignore: ['$app/stores'],
    gzip: true,
  },
  // Core SDK subpath entry points (ESM)
  {
    name: '@sentry/core/server',
    path: 'packages/core/build/esm/server.js',
    import: '*',
    gzip: true,
  },
  {
    name: '@sentry/core/browser',
    path: 'packages/core/build/esm/browser.js',
    import: '*',
    gzip: true,
  },
  // Node SDK (ESM)
  {
    name: '@sentry/node',
    path: 'packages/node/build/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
  },
  {
    name: '@sentry/node/import (ESM hook with diagnostics-channel injection)',
    path: ['packages/server-runtime-injection/build/esm/hook.js', 'packages/node/build/import-hook.mjs'],
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
    modifyRolldownConfig: function (config) {
      // Both packages declare `sideEffects: false`, which would let the bundler
      // drop the side-effecting `--import` modules and report almost nothing.
      // Keep side effects so this measures what Node really loads. Only the
      // function form overrides `sideEffects` from package.json; `true` does not.
      config.treeshake = { moduleSideEffects: () => true };

      return config;
    },
  },
  {
    name: '@sentry/node - without tracing',
    path: 'packages/node/build/esm/index.js',
    import: createImport('initWithoutDefaultIntegrations', 'getDefaultIntegrationsWithoutPerformance'),
    gzip: true,
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    define: {
      __SENTRY_TRACING__: false,
    },
  },
  {
    name: '@sentry/node - without channel injection',
    path: 'packages/node/build/esm/index.js',
    import: createImport('init'),
    gzip: true,
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    define: {
      __SENTRY_CHANNEL_INJECTION__: false,
    },
  },
  // AWS SDK (ESM)
  {
    name: '@sentry/aws-serverless',
    path: 'packages/aws-serverless/build/npm/esm/index.js',
    import: createImport('init'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: true,
  },
  // Cloudflare SDK (ESM) - compressed, minified to match `wrangler deploy --dry-run --minify` output
  {
    name: '@sentry/cloudflare (withSentry) - minified',
    path: 'packages/cloudflare/build/esm/prod/index.js',
    import: createImport('withSentry', 'instrumentDurableObjectWithSentry', 'instrumentWorkflowWithSentry'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: false,
    brotli: false,
    modifyRolldownConfig: function (config) {
      // Match wrangler's build settings
      config.resolve = { conditionNames: ['workerd', 'worker', 'browser'] };
      config.output.keepNames = true;

      return config;
    },
  },
  // Cloudflare SDK (ESM) - uncompressed, unminified to match `wrangler deploy --dry-run` output
  {
    name: '@sentry/cloudflare (withSentry)',
    path: 'packages/cloudflare/build/esm/prod/index.js',
    import: createImport('withSentry', 'instrumentDurableObjectWithSentry', 'instrumentWorkflowWithSentry'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: false,
    brotli: false,
    modifyRolldownConfig: function (config) {
      // Match wrangler's build settings
      config.resolve = { conditionNames: ['workerd', 'worker', 'browser'] };
      config.output.keepNames = true;
      config.output.minify = false;
      // esbuild (and so wrangler) drops JSDoc comments; rolldown keeps them by default
      config.output.comments = { jsdoc: false };

      return config;
    },
  },
  // Next.js on Cloudflare Workers (ESM) - minified to match `wrangler deploy --dry-run --minify` output. An import of
  // `@sentry/node` in this entry more than doubles its size.
  {
    name: '@sentry/nextjs/cloudflare (withSentry) - minified',
    path: 'packages/nextjs/build/esm/cloudflare/index.js',
    import: createImport('withSentry'),
    ignore: [...builtinModules, ...nodePrefixedBuiltinModules],
    gzip: false,
    brotli: false,
    modifyRolldownConfig: function (config) {
      // Match wrangler's build settings
      config.resolve = { conditionNames: ['workerd', 'worker', 'browser'] };
      config.output.keepNames = true;

      return config;
    },
  },
];

function createImport(...args) {
  return `{ ${args.join(', ')} }`;
}

function createCDNPath(name) {
  return `packages/browser/build/bundles/${name}`;
}
