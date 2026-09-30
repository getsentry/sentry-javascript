import type { SentryRollupPluginOptions } from '../rollup';
import { _rollupPluginInternal } from '../rollup';
import { stampDebugIds, type OutputBundle } from '../rollup/debug-id-stamping';
import { createRequire } from 'node:module';

interface SentryVitePlugin {
  name: string;
  enforce: 'pre' | 'post';
  generateBundle?: {
    order: 'pre' | 'post';
    handler: (_outputOptions: unknown, bundle: OutputBundle) => void;
  };
}

function getViteMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const vite = req('vite') as { version?: string };
    return vite.version?.split('.')[0];
  } catch {
    // do nothing, we'll just not report a version
  }

  return undefined;
}

export const sentryVitePlugin = (options?: SentryRollupPluginOptions): SentryVitePlugin[] => {
  const plugins: SentryVitePlugin[] = [
    {
      enforce: 'pre',
      ..._rollupPluginInternal(options, 'vite', getViteMajorVersion()),
    },
  ];

  if (!options?.disable && options?.sourcemaps?.disable === 'disable-upload') {
    plugins.push({
      name: 'sentry-vite-debug-id-sourcemaps',
      enforce: 'post',
      generateBundle: {
        order: 'post',
        handler(_outputOptions, bundle) {
          // Vite can rewrite source maps after the early stamping hook, so restore their debug ID fields without changing JS.
          stampDebugIds(bundle, false);
        },
      },
    });
  }

  return plugins;
};

export type { Options as SentryVitePluginOptions } from '../core';
