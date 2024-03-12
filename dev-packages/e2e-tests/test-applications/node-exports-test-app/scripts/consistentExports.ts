import * as SentryAstro from '@sentry/astro';
import * as SentryBun from '@sentry/bun';
import * as SentryGoogleCloud from '@sentry/google-cloud';
import * as SentryNextJs from '@sentry/nextjs';
import * as SentryNode from '@sentry/node';
import * as SentryNodeExperimental from '@sentry/node-experimental';
import * as SentryRemix from '@sentry/remix';
import * as SentrySvelteKit from '@sentry/sveltekit';

// SentryAWS is CJS only
const SentryAWS = require('@sentry/aws-serverless');
// Using CJS export for Bun SDK
// const SentryBun = require('@sentry/bun');

/* List of exports that are safe to ignore / we don't require in any depending package */
const NODE_EXPERIMENTAL_EXPORTS_IGNORE = [
  'default',
  // Probably generated by transpilation, no need to require it
  '__esModule',
  // These are not re-exported where not needed
  'Http',
  'Undici',
];

/* List of exports that are safe to ignore / we don't require in any depending package */
const NODE_EXPORTS_IGNORE = [
  'default',
  // Probably generated by transpilation, no need to require it
  '__esModule',
];

/* Sanitized list of node exports */
const nodeExperimentalExports = Object.keys(SentryNodeExperimental).filter(
  e => !NODE_EXPERIMENTAL_EXPORTS_IGNORE.includes(e),
);
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
  },
  {
    package: '@sentry/bun',
    compareWith: nodeExports,
    exports: Object.keys(SentryBun),
    ignoreExports: [
      // not supported in bun:
      'NodeClient',
      'makeMain',
    ],
  },
  {
    package: '@sentry/nextjs',
    compareWith: nodeExperimentalExports,
    // Next.js doesn't require explicit exports, so we can just merge top level and `default` exports:
    // @ts-expect-error: `default` is not in the type definition but it's defined
    exports: Object.keys({ ...SentryNextJs, ...SentryNextJs.default }),
  },
  {
    package: '@sentry/remix',
    compareWith: nodeExperimentalExports,
    exports: Object.keys(SentryRemix),
  },
  {
    package: '@sentry/aws-serverless',
    compareWith: nodeExports,
    exports: Object.keys(SentryAWS),
    ignoreExports: ['makeMain'],
  },
  {
    package: '@sentry/google-cloud',
    compareWith: nodeExports,
    exports: Object.keys(SentryGoogleCloud),
    ignoreExports: ['makeMain'],
  },
  {
    package: '@sentry/sveltekit',
    compareWith: nodeExperimentalExports,
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
  console.error('\n❌ Found missing exports from @sentry/node in the following packages:\n');
  console.log(JSON.stringify(missingExports, null, 2));
  process.exit(1);
}

console.log('✅ All good :)');
