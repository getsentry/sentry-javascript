import { writeFileSync, existsSync } from 'fs';
import { download } from './download.mjs';

if (!existsSync('lib.deno.d.ts')) {
  writeFileSync(
    'lib.deno.d.ts',
    await download('https://github.com/denoland/deno/releases/download/v1.37.1/lib.deno.d.ts'),
  );
}
