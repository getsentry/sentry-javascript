import { mkdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

const _0777 = parseInt('0777', 8);

export function mkdirpSync(path: string): void {
  // tslint:disable-next-line:no-bitwise
  const mode = _0777 & ~process.umask();
  const resPath = resolve(path);

  try {
    mkdirSync(resPath, mode);
  } catch (err) {
    if (err.code === 'ENOENT') {
      mkdirpSync(dirname(resPath));
      mkdirSync(resPath);
    } else {
      try {
        if (!statSync(resPath).isDirectory()) {
          throw err;
        }
      } catch (_) {
        throw err;
      }
    }
  }
}
