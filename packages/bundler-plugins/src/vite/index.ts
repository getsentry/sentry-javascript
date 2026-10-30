import type { SentryRollupPluginOptions } from '../rollup';
import { _createRollupPluginInternals } from '../rollup';
import { createRequire } from 'node:module';

interface SentryVitePlugin {
  name: string;
  enforce: 'pre' | 'post';
  [hook: string]: unknown;
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
  const { main, post } = _createRollupPluginInternals(options, 'vite', getViteMajorVersion());

  const plugins: SentryVitePlugin[] = [{ enforce: 'pre', ...main }];

  if (post) {
    plugins.push({ enforce: 'post', ...post });
  }

  return plugins;
};

export type { Options as SentryVitePluginOptions } from '../core';
