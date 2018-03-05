import { mkdir, mkdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

const _0777 = parseInt('0777', 8);

function mkdirAsync(path: string, mode: number): Promise<void> {
  // We cannot use util.promisify here because that was only introduced
  // in Node 8 and we need to support older Node versions.
  return new Promise((res, reject) => {
    mkdir(path, mode, err => (err ? reject(err) : res()));
  });
}

/**
 * Recursively creates the given path.
 *
 * @param path A relative or absolute path to create.
 * @returns A promise that resolves when the path has been created.
 */
export async function mkdirp(path: string): Promise<void> {
  // tslint:disable-next-line:no-bitwise
  const mode = _0777 & ~process.umask();
  const realPath = resolve(path);

  try {
    return mkdirAsync(realPath, mode);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await mkdirp(dirname(realPath));
      return mkdirAsync(realPath, mode);
    } else {
      try {
        if (!statSync(realPath).isDirectory()) {
          throw err;
        }
      } catch (_) {
        throw err;
      }
    }
  }
}

/**
 * Synchronous version of {@link mkdirp}.
 *
 * @param path A relative or absolute path to create.
 */
export function mkdirpSync(path: string): void {
  // tslint:disable-next-line:no-bitwise
  const mode = _0777 & ~process.umask();
  const realPath = resolve(path);

  try {
    mkdirSync(realPath, mode);
  } catch (err) {
    if (err.code === 'ENOENT') {
      mkdirpSync(dirname(realPath));
      mkdirSync(realPath, mode);
    } else {
      try {
        if (!statSync(realPath).isDirectory()) {
          throw err;
        }
      } catch (_) {
        throw err;
      }
    }
  }
}
