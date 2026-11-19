import { debug, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SENTRY_RUNTIME_INSTRUMENTATIONS } from '@sentry/server-utils/orchestrion/config';
import { create } from '@apm-js-collab/code-transformer';
import { emitDiagnostics } from '@apm-js-collab/tracing-hooks/lib/diagnostics.js';
import getPackageVersion from '@apm-js-collab/tracing-hooks/lib/get-package-version.js';
import { getPackageType, installDiagnosticsHook } from './register';

type BunOnLoad = (
  options: { filter: RegExp },
  callback: (args: { path: string }) => { contents: string; loader: 'js' } | undefined,
) => void;

interface BunRuntime {
  version: string;
  plugin: (plugin: { name: string; setup: (build: { onLoad: BunOnLoad }) => void }) => void;
}

// The last `node_modules` segment: the package directory, its (scoped) name, and the file path in it.
const PACKAGE_FILE_REGEXP = /^(.*[/\\]node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+))[/\\](.+)$/;

/**
 * Before Bun 1.4.6, a CommonJS module returned by a runtime `onLoad` plugin loses its named
 * exports, so the transformed modules fail to load. See https://github.com/oven-sh/bun/issues/19279
 */
function hasBunRuntimePlugins(bunVersion: string): boolean {
  const { major = 0, minor = 0, patch = 0 } = parseSemver(bunVersion);
  return major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 6)));
}

/**
 * Registers the diagnostics-channel injection for `bun run`. Bun runs no Node module hooks, so the
 * transform runs in a runtime `Bun.plugin()`, and each module it transforms reports itself through
 * the same diagnostics hook as on Node.
 *
 * `@sentry/bun` calls this in `init()`, where it only reaches modules imported after `init()`, and
 * in its `@sentry/bun/import` preload, which also reaches the static imports of the entry module.
 * It does nothing outside of Bun, before Bun 1.4.6, and after the first call.
 */
export function registerBunRuntimeInjection(): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {});
  const bun = (globalThis as { Bun?: BunRuntime }).Bun;
  if (!bun || marker.runtime || marker.runtimeUnavailable) {
    return;
  }

  // `detectOrchestrionSetup()` warns at `init()` when no channels are injected at all, which is not
  // the case for an app built with `@sentry/bun/plugin`.
  if (!hasBunRuntimePlugins(bun.version)) {
    marker.runtimeUnavailable = true;
    debug.log('This Bun version cannot instrument modules at runtime; skipping diagnostics-channel injection.');
    return;
  }

  // Runs in `--preload` and in `init()`, where a throw would abort startup or make `init()` throw.
  try {
    installDiagnosticsHook();
    registerBunPlugin(bun);
  } catch (error) {
    marker.runtimeUnavailable = true;
    debug.warn('Failed to register diagnostics-channel injection via Bun.plugin():', error);
    return;
  }

  marker.runtime = marker.runtime || [];
  debug.log('Registered diagnostics-channel injection via Bun.plugin()');
}

function registerBunPlugin(bun: BunRuntime): void {
  const matcher = create(SENTRY_RUNTIME_INSTRUMENTATIONS);
  const names = [...new Set(SENTRY_RUNTIME_INSTRUMENTATIONS.map(config => config.module.name))].map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  // oxlint-disable-next-line sdk/no-regexp-constructor -- built from escaped config values, not end user input
  const filter = new RegExp(`node_modules[/\\\\](?:${names.join('|')})[/\\\\].*\\.[cm]?js$`);

  bun.plugin({
    name: 'sentry-orchestrion',
    setup(build) {
      build.onLoad({ filter }, ({ path }) => {
        const url = pathToFileURL(path).href;
        let moduleName: string | undefined;
        try {
          const [, dir, name, file] = PACKAGE_FILE_REGEXP.exec(path) ?? [];
          const transformer =
            dir && name && file
              ? matcher.getTransformer(name.replace(/\\/g, '/'), getPackageVersion(dir), file.replace(/\\/g, '/'))
              : undefined;
          if (!transformer) {
            return undefined;
          }

          moduleName = transformer.moduleName;
          const moduleType =
            path.endsWith('.mjs') || (!path.endsWith('.cjs') && getPackageType(dirname(path)) === 'module')
              ? 'esm'
              : 'cjs';
          const { code } = transformer.transform(readFileSync(path, 'utf8'), moduleType);
          emitDiagnostics({ url, moduleName });
          return { contents: code, loader: 'js' };
        } catch (error) {
          // A module that fails to transform loads as it is, as with the Node hooks.
          if (moduleName) {
            emitDiagnostics({ url, moduleName, error: error as Error });
          } else {
            debug.warn(`[instrumentation] could not match ${path} to an instrumentation:`, error);
          }
          return undefined;
        }
      });
    },
  });
}
