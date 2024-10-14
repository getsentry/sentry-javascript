import * as fs from 'fs';
import * as path from 'path';

/**
 *  Find the default SDK init file for the given type (client or server).
 *  The sentry.server.config file is prioritized over the instrument.server file.
 */
export function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
  const cwd = process.cwd();

  const filePaths: string[] = [];
  if (type === 'server') {
    for (const ext of possibleFileExtensions) {
      // order is important here - we want to prioritize the server.config file
      filePaths.push(path.join(cwd, `sentry.${type}.config.${ext}`));
      filePaths.push(path.join(cwd, 'public', `instrument.${type}.${ext}`));
    }
  } else {
    for (const ext of possibleFileExtensions) {
      filePaths.push(path.join(cwd, `sentry.${type}.config.${ext}`));
    }
  }

  return filePaths.find(filename => fs.existsSync(filename));
}
