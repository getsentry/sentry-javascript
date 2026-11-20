import * as fs from 'fs';
import { collectInstalledModules } from '@sentry/server-utils/no-diagnostic-channels';
import type { Options } from './types';

/**
 * The dependencies of the app at `root`, with the exact version installed in `node_modules` where it resolves and
 * the declared range otherwise.
 */
export function getInstalledModules(root: string): Record<string, string> {
  return collectInstalledModules({
    readFile: filePath => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined),
    cwd: root,
  });
}

/**
 * Plugin options for frameworks that add the plugin although the user turned source maps off. For now they turn off
 * everything except injecting module versions: no source map upload, deletion or debug IDs, no release creation or
 * injection, and no telemetry.
 */
export function getDisabledSourcemapsOptions(options: Pick<Options, 'debug' | 'injectModuleVersions'> = {}): Options {
  return {
    ...options,
    telemetry: false,
    sourcemaps: { upload: false, injectDebugIds: false },
    release: { inject: false, create: false, finalize: false, setCommits: false, deploy: false },
  };
}
