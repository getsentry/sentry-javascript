import * as fs from 'fs';
import { collectInstalledModules } from '@sentry/server-utils/no-diagnostic-channels';

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
