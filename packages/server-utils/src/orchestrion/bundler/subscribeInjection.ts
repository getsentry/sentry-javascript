import type { CustomTransform } from '@apm-js-collab/code-transformer';
import { parse } from 'meriyah';
import { SUBSCRIBE_INJECTIONS } from '../config';
import { subscriberExportForModule } from '../config/channel-integration-definitions';
import { SUBSCRIBE_TRANSFORM_NAME } from '../config/subscribe-injection';
import type { PluginOptions } from './options';

// Tracks Program nodes we already injected into, so a package with several
// instrumented files (or several configs pointing at one file) is injected only
// once per file. A `WeakSet` keyed by the node avoids mutating the emitted AST.
const injectedPrograms = new WeakSet<object>();

interface ProgramNode {
  type: string;
  body: Array<{ type: string; directive?: string }>;
}

/**
 * Snippet injected into each instrumented module. It imports ONLY that package's
 * channel-subscriber factory from `@sentry/server-utils/orchestrion` plus the two
 * `@sentry/core` helpers it needs, then does two things when the module first
 * evaluates:
 *
 * 1. Stores the factory on the global orchestrion marker under its export name,
 *    so a later `init()` (a fresh isolate, or a client created after this module
 *    loads) picks it up via `getDefaultIntegrations()`.
 * 2. If a client already exists, registers the integration live on it right away.
 *
 * Step 2 is what makes this robust against module load order. Bundler-only SDKs
 * (e.g. `@sentry/cloudflare`) call `init()` per request, but a package like
 * `mysql` loads its instrumented file lazily on first use — i.e. AFTER that
 * request's `init()` already snapshotted the marker. Without the live add, the
 * first request that touches such a package would publish to a channel nobody
 * subscribed to yet. `addIntegration` dedupes by integration name and only runs
 * `setupOnce` once, so storing AND live-adding never double-subscribes.
 *
 * The marker is a `Map` keyed by export name so a package split across several
 * instrumented files (e.g. `pg`'s JS and native clients, or openai's per-resource
 * `.js`/`.mjs` files) registers its one subscriber once, no matter how many of
 * its files land in the bundle — `.set` on the shared key is idempotent.
 *
 * Importing the single named factory (rather than a central dispatch that pulls
 * in every subscriber) is what makes this tree-shake: a bundle carries only the
 * subscriber code for packages actually transformed into it — the same
 * "only-active-when-bundled" property the runtime module hook gives unbundled
 * Node, but without a hook (workerd can't monkey-patch requires).
 */
function subscribeSnippet(exportName: string, esm: boolean): string {
  const importStmt = esm
    ? `import { ${exportName} } from '@sentry/server-utils/orchestrion';\nimport { getClient as __sentryGetClient } from '@sentry/core';`
    : `const { ${exportName} } = require('@sentry/server-utils/orchestrion');\nconst { getClient: __sentryGetClient } = require('@sentry/core');`;

  // `??=` keeps the marker init a no-op after the first instrumented file
  // creates the Map; keying by export name dedupes packages split across files.
  return (
    `${importStmt}\n` +
    '(globalThis.__SENTRY_ORCHESTRION__ ??= {}).integrations ??= new Map();\n' +
    `globalThis.__SENTRY_ORCHESTRION__.integrations.set(${JSON.stringify(exportName)}, ${exportName});\n` +
    `__sentryGetClient()?.addIntegration(${exportName}());`
  );
}

/**
 * The custom transform registered under {@link SUBSCRIBE_TRANSFORM_NAME}. It is
 * invoked with the matched `Program` node and mutates it in place, splicing the
 * marker-push snippet in after any `'use strict'` directive.
 *
 * `state` carries the matched config spread with `{ moduleType }`; the config's
 * `channelName` carries the package name (see `toSubscribeInjections`), which
 * maps to the subscriber's export name.
 */
const injectSubscribe: CustomTransform = (state, program) => {
  const node = program as unknown as ProgramNode;
  if (injectedPrograms.has(node)) {
    return;
  }

  const { moduleType, channelName } = state as { moduleType?: string; channelName?: string };
  const exportName = channelName ? subscriberExportForModule(channelName) : undefined;
  if (!exportName) {
    return;
  }

  injectedPrograms.add(node);

  const statements = parse(subscribeSnippet(exportName, moduleType === 'esm'), {
    module: moduleType === 'esm',
    next: true,
  }).body as ProgramNode['body'];

  const directiveIndex = node.body.findIndex(n => n.type === 'ExpressionStatement' && n.directive === 'use strict');
  node.body.splice(directiveIndex + 1, 0, ...statements);
};

/**
 * The `instrumentations` + `customTransforms` a bundler plugin passes to
 * {@link orchestrionTransformOptions} to enable the marker-push subscribe
 * injection used by bundler-only SDKs (e.g. `@sentry/cloudflare`).
 *
 * The `SUBSCRIBE_INJECTIONS` configs ride alongside the real channel-publishing
 * configs, and `injectSubscribe` runs on each matched module, so every
 * transformed package self-registers its subscriber on the global marker
 * without a runtime module hook.
 */
export function subscribeInjectionOptions(): Pick<PluginOptions, 'instrumentations' | 'customTransforms'> {
  return {
    instrumentations: SUBSCRIBE_INJECTIONS,
    customTransforms: { [SUBSCRIBE_TRANSFORM_NAME]: injectSubscribe },
  };
}
