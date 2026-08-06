import type { CustomTransform } from '../apmTypes';
import { parse } from 'meriyah';
import { subscriberExportForModule } from '../config/channel-integration-definitions';
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
 * Override for orchestrion's built-in `tracingChannelImport` transform, which
 * runs (via `tracingChannelDeclaration`) for every file that gets a channel
 * wrapped — the one hook that reaches every instrumented module without any
 * extra instrumentation configs. It chains the default (which splices the
 * `diagnostics_channel` import and bails when it is already present), then
 * splices the marker-push snippet in after any `'use strict'` directive.
 *
 * Invoked once per wrapped channel, so the `WeakSet` keeps the snippet to one
 * per file. Requires `@apm-js-collab/code-transformer` >= 0.18.1, where
 * built-ins dispatch through the override map and expose the originals on
 * `state.transforms.defaults`.
 */
const injectSubscribe: CustomTransform = (state, program, parent, ancestry) => {
  const { moduleType, module, transforms } = state as {
    moduleType?: string;
    module?: { name?: string };
    transforms: { defaults: { tracingChannelImport: CustomTransform } };
  };

  transforms.defaults.tracingChannelImport(state, program, parent, ancestry);

  const node = program as ProgramNode;
  if (injectedPrograms.has(node)) {
    return;
  }

  const exportName = module?.name ? subscriberExportForModule(module.name) : undefined;
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
 * The `customTransforms` a bundler plugin passes to
 * {@link orchestrionTransformOptions} to enable the marker-push subscribe
 * injection used by bundler-only SDKs (e.g. `@sentry/cloudflare`).
 *
 * Overriding the built-in `tracingChannelImport` transform makes
 * `injectSubscribe` run on every instrumented module, so every transformed
 * package self-registers its subscriber on the global marker without a runtime
 * module hook — and without a parallel set of injection configs.
 */
export function subscribeInjectionOptions(): Pick<PluginOptions, 'customTransforms'> {
  return {
    customTransforms: { tracingChannelImport: injectSubscribe },
  };
}
