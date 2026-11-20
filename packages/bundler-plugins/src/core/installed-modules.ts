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
 * Plugin options that turn off everything the plugin does except injecting module versions: no source map upload,
 * deletion or debug IDs, no release creation or injection, and no telemetry. Frameworks add the plugin with these
 * where they would otherwise skip it, for example when the user turned source maps off.
 */
export function getModuleVersionsOnlyOptions(options: Pick<Options, 'debug' | 'injectModuleVersions'> = {}): Options {
  return {
    ...options,
    telemetry: false,
    sourcemaps: { upload: false, injectDebugIds: false },
    release: { inject: false, create: false, finalize: false, setCommits: false, deploy: false },
  };
}
