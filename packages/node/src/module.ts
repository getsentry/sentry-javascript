import { basename, dirname } from '@sentry/utils';

/** normalizes Windows paths */
function normalizePath(path: string): string {
  return path
    .replace(/^[A-Z]:/, '') // remove Windows-style prefix
    .replace(/\\/g, '/'); // replace all `\` instances with `/`
}

/** Gets the module from a filename */
export function getModule(filename: string | undefined): string | undefined {
  if (!filename) {
    return;
  }

  const normalizedFilename = normalizePath(filename);

  // We could use optional chaining here but webpack does like that mixed with require
  const base = normalizePath(
    `${(require && require.main && require.main.filename && dirname(require.main.filename)) || global.process.cwd()}/`,
  );

  // It's specifically a module
  const file = basename(normalizedFilename, '.js');

  const path = dirname(normalizedFilename);
  let n = path.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${path.slice(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${path}/`.lastIndexOf(base, 0);

  if (n === 0) {
    let moduleName = path.slice(base.length).replace(/\//g, '.');
    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;
    return moduleName;
  }
  return file;
}
