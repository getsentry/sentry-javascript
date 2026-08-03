import type { CustomTransform } from '../apmTypes';
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
 * channel-subscriber factory (plus the `registerOrchestrionChannelIntegration`
 * helper) from `@sentry/server-utils/orchestrion`, and hands both to the helper,
 * which stores the factory on the global marker and live-registers it on any
 * existing client (see that helper for the load-order and dedup rationale).
 *
 * Importing the single named factory (rather than a central dispatch that pulls
 * in every subscriber) is what makes this tree-shake: a bundle carries only the
 * subscriber code for packages actually transformed into it. The same
 * "only-active-when-bundled" property the runtime module hook gives unbundled
 * Node, but without a hook (workerd can't monkey-patch requires). The helper is
 * generic (references no factory), so importing it alongside doesn't pull siblings.
 */
function subscribeSnippet(exportName: string, esm: boolean): string {
  const importStmt = esm
    ? `import { ${exportName}, registerOrchestrionChannelIntegration } from '@sentry/server-utils/orchestrion';`
    : `const { ${exportName}, registerOrchestrionChannelIntegration } = require('@sentry/server-utils/orchestrion');`;

  return `${importStmt}\nregisterOrchestrionChannelIntegration(${JSON.stringify(exportName)}, ${exportName});`;
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
  const node = program as ProgramNode;
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
