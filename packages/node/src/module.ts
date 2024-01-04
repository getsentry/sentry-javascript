import { posix, sep } from 'path';
import { dirname } from '@sentry/utils';

/** normalizes Windows paths */
function normalizeWindowsPath(path: string): string {
  return path
    .replace(/^[A-Z]:/, '') // remove Windows-style prefix
    .replace(/\\/g, '/'); // replace all `\` instances with `/`
}

// We cache this so we don't have to recompute it
let basePath: string | undefined;

function getBasePath(): string {
  if (!basePath) {
    const baseDir =
      require && require.main && require.main.filename ? dirname(require.main.filename) : global.process.cwd();
    basePath = `${baseDir}/`;
  }

  return basePath;
}

/** Gets the module from a filename */
export function getModuleFromFilename(
  filename: string | undefined,
  basePath: string = getBasePath(),
  isWindows: boolean = sep === '\\',
): string | undefined {
  if (!filename) {
    return;
  }

  const normalizedBase = isWindows ? normalizeWindowsPath(basePath) : basePath;
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

  let n = dir.lastIndexOf('/node_modules');
  if (n > -1) {
    return `${dir.slice(n + 14).replace(/\//g, '.')}:${file}`;
  }

  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${dir}/`.lastIndexOf(normalizedBase, 0);
  if (n === 0) {
    let moduleName = dir.slice(normalizedBase.length).replace(/\//g, '.');

    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;

    return moduleName;
  }

  return file;
}
