import { posix, sep } from 'path';

const isWindowsPlatform = sep === '\\';

/** normalizes Windows paths */
function normalizeWindowsPath(path: string): string {
  return path
    .replace(/^[A-Z]:/, '') // remove Windows-style prefix
    .replace(/\\/g, '/'); // replace all `\` instances with `/`
}

/** Gets the module from a filename */
export function getModuleFromFilename(
  filename: string | undefined,
  normalizeWindowsPathSeparator: boolean = isWindowsPlatform,
): string | undefined {
  if (!filename) {
    return;
  }

  const normalizedFilename = normalizeWindowsPathSeparator ? normalizeWindowsPath(filename) : filename;

  // eslint-disable-next-line prefer-const
  let { root, dir, base: basename, ext } = posix.parse(normalizedFilename);

  const base = (require && require.main && require.main.filename && dir) || global.process.cwd();

  const normalizedBase = `${base}/`;

  // It's specifically a module
  let file = basename;

  if (ext === '.js' || ext === '.mjs') {
    file = file.slice(0, ext.length * -1);
  }

  if (!root && !dir) {
    // No dirname whatsoever
    dir = '.';
  }

  let n = dir.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
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
