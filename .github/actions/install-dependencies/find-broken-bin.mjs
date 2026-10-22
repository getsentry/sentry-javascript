// Prints the first `.bin` entry in the given node_modules folders whose target does not exist.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The pnpm shell shim runs the target with `exec <node> "$basedir_abs/<path>"` (`$basedir` in older versions)
const SHIM_TARGET = /^\s*exec \S+\s+"\$basedir(?:_abs)?\/([^"]+)"/m;

for (const dir of process.argv.slice(2)) {
  const binDir = join(dir, '.bin');
  let names;
  try {
    names = readdirSync(binDir);
  } catch {
    continue;
  }

  for (const name of names) {
    const bin = join(binDir, name);
    const stat = lstatSync(bin);
    let target;
    if (stat.isSymbolicLink()) {
      target = bin;
    } else if (stat.isFile() && stat.size < 64 * 1024) {
      const match = readFileSync(bin, 'utf8').match(SHIM_TARGET);
      target = match && resolve(binDir, match[1]);
    }

    if (target && !existsSync(target)) {
      // eslint-disable-next-line no-console
      console.log(bin);
      process.exit(0);
    }
  }
}
