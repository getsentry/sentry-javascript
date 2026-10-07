import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoadHookTransform } from '@sentry/server-utils/orchestrion/load-hook';
import { remixV3Config } from '@sentry/server-utils/orchestrion/config';

/** Node's synchronous `load` hook shape, which `@remix-run/assets` reuses for `scripts.loaders`. */
export interface ModuleLoadContext {
  moduleUrl?: string;
  [key: string]: unknown;
}

export interface ModuleLoadResult {
  format: string | null | undefined;
  shortCircuit?: boolean;
  source?: string | ArrayBuffer | ArrayBufferView;
}

export type ModuleLoader = (
  url: string,
  context: ModuleLoadContext,
  nextLoad: (url: string, context?: Partial<ModuleLoadContext>) => ModuleLoadResult,
) => ModuleLoadResult;

/**
 * An asset server loader that applies orchestrion's transform to browser modules. Remix 3 has no
 * bundler, so the asset server's loader chain is the only compile time hook there is.
 *
 * `dcModuleUrl`, the shim's public URL, must also be in `scripts.external`, so the compiler leaves
 * the injected import alone.
 */
export function orchestrionLoader(dcModuleUrl: string): ModuleLoader {
  const cached = loaders.get(dcModuleUrl);
  if (cached) {
    return cached;
  }

  // Only the Remix 3 configs. The others target server packages, and their injected snippet imports
  // `@sentry/server-utils`, which cannot resolve in a browser.
  const transform = createLoadHookTransform({ dcModule: dcModuleUrl, instrumentations: remixV3Config });

  const loader: ModuleLoader = (url, context, nextLoad) => {
    const result = nextLoad(url, context);
    if (result.format !== 'module' || typeof result.source !== 'string') {
      return result;
    }

    // An uninstrumented module is better than one the asset server cannot serve at all.
    try {
      const transformed = transform(fileURLToPath(url), result.source);
      return transformed === undefined ? result : { ...result, source: transformed };
    } catch {
      return result;
    }
  };

  loaders.set(dcModuleUrl, loader);
  return loader;
}

// One loader per shim URL, so options that pass through `withDebugIdOptions` twice keep one copy.
const loaders = new Map<string, ModuleLoader>();

export function isOrchestrionLoader(loader: unknown): boolean {
  for (const known of loaders.values()) {
    if (known === loader) {
      return true;
    }
  }
  return false;
}

/**
 * Public URL of the shipped shim under the asset server's `node_modules` mount, encoded per segment as
 * the asset server encodes imports. `@sentry` and `%40sentry` are different modules to a browser; a
 * mismatch loads two shims and instrumentation quietly does nothing.
 */
export function getShimUrl(
  basePath: string,
  rootDir: string,
  mounts: Readonly<Record<string, string>> | undefined,
  shimPath: string,
): string | undefined {
  const nodeModulesRoot = path.join(rootDir, 'node_modules');
  const relativePath = path.relative(nodeModulesRoot, shimPath);
  // Outside the mount, as with a `link:` install or another Windows drive, the asset server cannot
  // serve it. Checked before splitting: a drive prefix is only absolute as part of the whole path.
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }
  const encoded = relativePath
    .split(path.sep)
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${basePath.replace(/\/$/, '')}/${npmMount(mounts)}/${encoded}`;
}

// The default mounts are `{ app: 'app', npm: 'node_modules' }`, but an app can rename them.
function npmMount(mounts: Readonly<Record<string, string>> | undefined): string {
  const entry = mounts && Object.entries(mounts).find(([, dir]) => dir === 'node_modules' || dir === './node_modules');
  return entry ? entry[0] : 'npm';
}

// The shim is built next to this module, so its path follows from this module's own under any
// install layout. A package self reference would not work: the `./v3` subpaths are import only.
export function resolveShimPath(): string {
  let here: string;
  /*! rollup-include-cjs-only */
  here = __filename;
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  here = fileURLToPath(import.meta.url);
  /*! rollup-include-esm-only-end */
  return path.join(path.dirname(here), 'client', 'diagnosticsChannelShim.js');
}
