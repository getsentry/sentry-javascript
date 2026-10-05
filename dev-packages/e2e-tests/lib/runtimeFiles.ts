/* eslint-disable no-console */
import { copyFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Copies each file in `dir` that has `runtime` as a part of its name over the existing file without that part, for
 * example `app/entry.server.cloudflare.tsx` over `app/entry.server.tsx`.
 */
export function applyRuntimeFiles(dir: string, runtime: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      applyRuntimeFiles(path, runtime);
      continue;
    }

    const segments = entry.name.split('.');
    const index = segments.indexOf(runtime);
    if (index <= 0 || index === segments.length - 1) {
      continue;
    }

    const target = join(dir, segments.filter((_, i) => i !== index).join('.'));
    if (existsSync(target)) {
      copyFileSync(path, target);
      console.log(`Copied ${path} to ${target} for ${runtime}`);
    }
  }
}
