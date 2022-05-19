import { basename, dirname } from '@sentry/utils';

/** Gets the module from a filename */
export function getModule(filename: string | undefined): string | undefined {
  if (!filename) {
    return;
  }

  // We could use optional chaining here but webpack does like that mixed with require
  const base = `${
    (require && require.main && require.main.filename && dirname(require.main.filename)) || global.process.cwd()
  }/`;

  // It's specifically a module
  const file = basename(filename, '.js');

  const path = dirname(filename);
  let n = path.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${path.substr(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${path}/`.lastIndexOf(base, 0);

  if (n === 0) {
    let moduleName = path.substr(base.length).replace(/\//g, '.');
    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;
    return moduleName;
  }
  return file;
}
