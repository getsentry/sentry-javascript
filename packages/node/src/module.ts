import { posix, sep } from 'path';
import { dirname } from '@sentry/utils';

/** normalizes Windows paths */
function normalizeWindowsPath(path: string): string {
  return path
    .replace(/^[A-Z]:/, '') // remove Windows-style prefix
    .replace(/\\/g, '/'); // replace all `\` instances with `/`
}

/** Creates a function that gets the module name from a filename */
export function createGetModuleFromFilename(
  basePath: string = process.argv[1] ? dirname(process.argv[1]) : process.cwd(),
  isWindows: boolean = sep === '\\',
): (filename: string | undefined) => string | undefined {
  const normalizedBase = isWindows ? normalizeWindowsPath(basePath) : basePath;

  return (filename: string | undefined) => {
    if (!filename) {
      return;
    }

    const normalizedFilename = isWindows ? normalizeWindowsPath(filename) : filename;

    // eslint-disable-next-line prefer-const
    let { dir, base: file, ext } = posix.parse(normalizedFilename);

    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      file = file.slice(0, ext.length * -1);
    }

    if (!dir) {
      // No dirname whatsoever
      dir = '.';
    }

    const n = dir.lastIndexOf('/node_modules');
    if (n > -1) {
      return `${dir.slice(n + 14).replace(/\//g, '.')}:${file}`;
    }

    // Let's see if it's a part of the main module
    // To be a part of main module, it has to share the same base
    if (dir.startsWith(normalizedBase)) {
      let moduleName = dir.slice(normalizedBase.length + 1).replace(/\//g, '.');

      if (moduleName) {
        moduleName += ':';
      }
      moduleName += file;

      return moduleName;
    }

    return file;
  };
}
