import { resolve } from 'node:path';
import { defaultStackParser } from '../sdk/api';

export interface ProcessInterface {
  execArgv: string[];
  argv: string[];
  cwd: () => string;
}

export interface ProcessArgs {
  appPath: string;
  importPaths: string[];
  requirePaths: string[];
}

/**
 * Parses the process arguments to determine the app path, import paths, and require paths.
 */
export function parseProcessPaths(proc: ProcessInterface): ProcessArgs {
  const { execArgv, argv, cwd: getCwd } = proc;
  const cwd = getCwd();
  const appPath = resolve(cwd, argv[1] || '');

  const joinedArgs = execArgv.join(' ');
  const importPaths = Array.from(joinedArgs.matchAll(/--import[ =](\S+)/g)).map(e => resolve(cwd, e[1] || ''));
  const requirePaths = Array.from(joinedArgs.matchAll(/--require[ =](\S+)/g)).map(e => resolve(cwd, e[1] || ''));

  return { appPath, importPaths, requirePaths };
}

/**
 * Gets the current entry point type.
 *
 * `app` means this function was most likely called via the app entry point.
 * `import` means this function was most likely called from an --import cli arg.
 * `require` means this function was most likely called from a --require cli arg.
 * `unknown` means we couldn't determine for sure.
 */
export function getEntryPointType(proc: ProcessInterface = process): 'import' | 'require' | 'app' | 'unknown' {
  const filenames = defaultStackParser(new Error().stack || '')
    .map(f => f.filename)
    .filter(Boolean) as string[];

  const { appPath, importPaths, requirePaths } = parseProcessPaths(proc);

  const output = [];

  if (appPath && filenames.includes(appPath)) {
    output.push('app');
  }

  if (importPaths.some(p => filenames.includes(p))) {
    output.push('import');
  }

  if (requirePaths.some(p => filenames.includes(p))) {
    output.push('require');
  }

  // We only only return anything other than 'unknown' if we only got one match.
  if (output.length === 1) {
    return output[0] as 'import' | 'require' | 'app';
  }

  return 'unknown';
}
