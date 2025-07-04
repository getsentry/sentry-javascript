import * as SentryAstro from '@sentry/astro';
import * as SentryBun from '@sentry/bun';
import * as SentryNextJs from '@sentry/nextjs';
import * as SentryNode from '@sentry/node';
import * as SentryRemix from '@sentry/remix';
import * as SentrySvelteKit from '@sentry/sveltekit';

// Serverless SDKs are CJS only
const SentryAWS = require('@sentry/aws-serverless');
const SentryGoogleCloud = require('@sentry/google-cloud-serverless');

/* List of exports that are safe to ignore / we don't require in any depending package */
const NODE_EXPORTS_IGNORE = [
  'default',
  // Probably generated by transpilation, no need to require it
  '__esModule',
  // Only required from the Node package
  'setNodeAsyncContextStrategy',
  'getDefaultIntegrationsWithoutPerformance',
  'initWithoutDefaultIntegrations',
  'SentryContextManager',
  'validateOpenTelemetrySetup',
  'preloadOpenTelemetry',
];

const nodeExports = Object.keys(SentryNode).filter(e => !NODE_EXPORTS_IGNORE.includes(e));

type Dependent = {
  package: string;
  exports: string[];
  ignoreExports?: string[];
  skip?: boolean;
  compareWith: string[];
};

const DEPENDENTS: Dependent[] = [
  {
    package: '@sentry/astro',
    compareWith: nodeExports,
    exports: Object.keys(SentryAstro),
    ignoreExports: [
      // Not needed for Astro
      'setupFastifyErrorHandler',
    ],
  },
  {
    package: '@sentry/bun',
    compareWith: nodeExports,
    exports: Object.keys(SentryBun),
    ignoreExports: [
      // not supported in bun:
      'NodeClient',
      'NODE_VERSION',
      'childProcessIntegration',
    ],
  },
  {
    package: '@sentry/nextjs',
    compareWith: nodeExports,
    // Next.js doesn't require explicit exports, so we can just merge top level and `default` exports:
    // @ts-expect-error: `default` is not in the type definition but it's defined
    exports: Object.keys({ ...SentryNextJs, ...SentryNextJs.default }),
  },
  {
    package: '@sentry/remix',
    compareWith: nodeExports,
    exports: Object.keys(SentryRemix),
  },
  {
    package: '@sentry/aws-serverless',
    compareWith: nodeExports,
    exports: Object.keys(SentryAWS),
    ignoreExports: [
      // Not needed for Serverless
      'setupFastifyErrorHandler',
    ],
  },
  {
    package: '@sentry/google-cloud-serverless',
    compareWith: nodeExports,
    exports: Object.keys(SentryGoogleCloud),
    ignoreExports: [
      // Not needed for Serverless
      'setupFastifyErrorHandler',
    ],
  },
  {
    package: '@sentry/sveltekit',
    compareWith: nodeExports,
    exports: Object.keys(SentrySvelteKit),
  },
];

console.log('🔎 Checking for consistent exports of @sentry/node exports in depending packages');

const missingExports: Record<string, string[]> = {};
const dependentsToCheck = DEPENDENTS.filter(d => !d.skip);

for (const dependent of dependentsToCheck) {
  for (const nodeExport of dependent.compareWith) {
    if (dependent.ignoreExports?.includes(nodeExport)) {
      continue;
    }
    if (!dependent.exports.includes(nodeExport)) {
      missingExports[dependent.package] = [...(missingExports[dependent.package] ?? []), nodeExport];
    }
  }
}

if (Object.keys(missingExports).length > 0) {
  console.log('\n❌ Found missing exports from @sentry/node in the following packages:\n');
  console.log(JSON.stringify(missingExports, null, 2));
  process.exit(1);
}

console.log('✅ All good :)');
