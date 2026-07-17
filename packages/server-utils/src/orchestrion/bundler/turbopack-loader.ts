// EXPERIMENTAL — orchestrion code-transform loader for Turbopack.
//
// Turbopack accepts webpack loaders but not plugins, so — unlike the webpack path, where the plugin
// injects one boot-time snippet listing every transformed module — there is no build lifecycle hook
// to surface the injected-module list at runtime. This loader wraps the same code transform and, for
// each module it actually instruments, appends a self-registration prologue (see `./inject`) so the
// module announces itself to the SDK when it loads. That gives the *precise* set of build-time
// instrumented modules, matching how the runtime module hook reports the ones it injects.

import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import { buildInjectPrologue } from './inject';

// The subset of the webpack loader context we rely on (Turbopack provides the same shape).
interface LoaderContext {
  resourcePath: string;
  async: () => (error: Error | null, code?: string, map?: unknown) => void;
}

// Built once per loader process; the transform is pure config, so it is safe to reuse.
let transformer: ReturnType<typeof createCodeTransformer> | undefined;

function getTransformer(): ReturnType<typeof createCodeTransformer> {
  return (transformer ??= createCodeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS }));
}

// The package name a module path belongs to, e.g. `.../node_modules/ioredis/built/Redis.js` → `ioredis`
// and `.../node_modules/@scope/pkg/x.js` → `@scope/pkg`. Uses the last `node_modules` segment so nested
// dependencies resolve to their own name, and normalizes Windows separators.
function moduleNameFromPath(id: string): string | undefined {
  const re = /(?:^|[\\/])node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/g;
  let name: string | undefined;
  for (let match = re.exec(id); match; match = re.exec(id)) {
    name = match[1];
  }
  return name?.replace(/\\/g, '/');
}

/**
 * Webpack/Turbopack loader that instruments supported modules and appends the self-registration
 * prologue to the ones it transforms. Non-matching modules pass through untouched; any failure falls
 * back to the original source so a build never breaks.
 */
export default function sentryOrchestrionLoader(this: LoaderContext, code: string, map?: unknown): void {
  const callback = this.async();

  try {
    const result = getTransformer().transform(code, this.resourcePath, map as string | undefined);
    if (!result) {
      callback(null, code, map);
      return;
    }

    const moduleName = moduleNameFromPath(this.resourcePath);
    const prologue = moduleName ? buildInjectPrologue(moduleName) : '';
    callback(null, `${result.code}${prologue}`, result.map);
  } catch {
    callback(null, code, map);
  }
}
