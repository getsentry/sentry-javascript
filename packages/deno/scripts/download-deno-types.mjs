import { existsSync, writeFileSync } from 'fs';
import { download } from './download.mjs';

if (!existsSync('lib.deno.d.ts')) {
  const code = await download('https://github.com/denoland/deno/releases/download/v2.1.5/lib.deno.d.ts');
  writeFileSync('lib.deno.d.ts', code);
}
