import type { CustomTransform } from '../apmTypes';
import { parse } from 'meriyah';
import { subscriberExportForModule } from '../config/channel-integration-definitions';
import { MODULE_REGISTRATION_TRANSFORM } from '../config/registration-only';

// Tracks Program nodes we already injected into, so a package with several
// instrumented files (or several configs pointing at one file) is injected only
// once per file. A `WeakSet` keyed by the node avoids mutating the emitted AST.
const injectedPrograms = new WeakSet<object>();

interface ProgramNode {
  type: string;
  body: Array<{ type: string; directive?: string }>;
}

// Where the injected snippet imports from: the `orchestrionModuleInjected`
// helper and the module's channel-subscriber factory both live on the main
// `@sentry/server-utils` entry, so a single import serves both. The ESM barrel
// tree-shakes to just the helper and the factories actually referenced.
const DEFAULT_IMPORT_SPECIFIER = '@sentry/server-utils';

/**
 * Entry-chunk banner that marks "the bundler plugin ran" for
 * `detectOrchestrionSetup()`. Merge-only (`g.bundler = g.bundler || []`) so it
 * can never clobber module names already recorded by an injected snippet that
 * happened to run first; the names themselves arrive per module, when each
 * transformed module is evaluated and its snippet calls
 * `orchestrionModuleInjected`.
 */
export const ORCHESTRION_BUNDLER_MARKER_BANNER =
  ';(function(){var g=globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};g.bundler=g.bundler||[];})();';

/**
 * Snippet injected into each instrumented module. It imports the
 * `orchestrionModuleInjected` helper — plus the module's channel-subscriber
 * factory, when it has one — from `@sentry/server-utils` and calls the helper
 * with the module's real name. The helper records the module on the global
 * marker, stores the factory, and emits the `orchestrion.module-injected` client
 * event, so it runs exactly when the module is evaluated — the moment its
 * channels can start publishing. That per-module timing is what keeps
 * subscriptions lazy (Node caps diagnostics channels in use at 1024).
 *
 * Importing the single named factory (rather than a central dispatch that pulls
 * in every subscriber) is what makes this tree-shake: a bundle carries only the
 * subscriber code for packages actually transformed into it. The helper is
 * generic (references no factory), so importing it alongside doesn't pull
 * siblings.
 *
 * The specifier is parameterized for bundlers where the bare import emitted
 * inside a transformed `node_modules` file can't resolve (Turbopack under
 * isolated installs); it's embedded via `JSON.stringify` so absolute Windows
 * paths survive.
 */
function moduleInjectedSnippet(
  moduleName: string,
  exportName: string | undefined,
  esm: boolean,
  importSpecifier: string,
): string {
  const bindings = exportName ? `orchestrionModuleInjected, ${exportName}` : 'orchestrionModuleInjected';
  const importStmt = esm
    ? `import { ${bindings} } from ${JSON.stringify(importSpecifier)};`
    : `const { ${bindings} } = require(${JSON.stringify(importSpecifier)});`;

  const args = exportName ? `${JSON.stringify(moduleName)}, ${exportName}` : JSON.stringify(moduleName);
  return `${importStmt}\norchestrionModuleInjected(${args});`;
}

/**
 * The unified `customTransforms` every orchestrion bundler plugin (and the
 * webpack/Turbopack loader) applies: an override for orchestrion's built-in
 * `tracingChannelImport` transform, which runs (via `tracingChannelDeclaration`)
 * for every file that gets a channel wrapped — the one hook that reaches every
 * instrumented module without any extra instrumentation configs. It chains the
 * default (which splices the `diagnostics_channel` import and bails when it is
 * already present), then splices the module-injected snippet in after any
 * `'use strict'` directive.
 *
 * Invoked once per wrapped channel, so the `WeakSet` keeps the snippet to one
 * per file. Requires `@apm-js-collab/code-transformer` >= 0.18.1, where
 * built-ins dispatch through the override map and expose the originals on
 * `state.transforms.defaults`.
 *
 * Also carries the registration-only operator, which splices the same snippet
 * without any channel injection — for library versions whose tracing channels
 * are native.
 */
export function moduleInjectedTransforms(
  // A function is read per injected file — the webpack/Turbopack loader uses it
  // to supply a per-file relative specifier (Turbopack supports neither
  // absolute-path imports nor bare specifiers that don't resolve from the
  // importing file's location).
  importSpecifier?: string | (() => string | undefined),
): Record<string, CustomTransform> {
  const spliceModuleInjected = (state: unknown, program: unknown): void => {
    const { moduleType, module } = state as {
      moduleType?: string;
      module?: { name?: string };
    };

    const node = program as ProgramNode;
    if (injectedPrograms.has(node)) {
      return;
    }

    const moduleName = module?.name;
    if (!moduleName) {
      return;
    }

    injectedPrograms.add(node);

    const specifier =
      (typeof importSpecifier === 'function' ? importSpecifier() : importSpecifier) ?? DEFAULT_IMPORT_SPECIFIER;
    const exportName = subscriberExportForModule(moduleName);
    const statements = parse(moduleInjectedSnippet(moduleName, exportName, moduleType === 'esm', specifier), {
      module: moduleType === 'esm',
      next: true,
    }).body as ProgramNode['body'];

    const directiveIndex = node.body.findIndex(n => n.type === 'ExpressionStatement' && n.directive === 'use strict');
    node.body.splice(directiveIndex + 1, 0, ...statements);
  };

  const injectModuleInjected: CustomTransform = (state, program, parent, ancestry) => {
    const { transforms } = state as {
      transforms: { defaults: { tracingChannelImport: CustomTransform } };
    };

    transforms.defaults.tracingChannelImport(state, program, parent, ancestry);
    spliceModuleInjected(state, program);
  };

  // Operator for registration-only configs (`transform` field, see
  // `config/registration-only.ts`): dispatched INSTEAD of `traceSync`, so no
  // channel is declared and no function is wrapped. Their `astQuery: 'Program'`
  // matches only the file root, so `node` is the Program itself.
  const injectRegistrationOnly: CustomTransform = (state, node) => {
    spliceModuleInjected(state, node);
  };

  return {
    tracingChannelImport: injectModuleInjected,
    [MODULE_REGISTRATION_TRANSFORM]: injectRegistrationOnly,
  };
}
