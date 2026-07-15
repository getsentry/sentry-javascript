import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Emits the two non-compiled artifacts a Nuxt module needs alongside `module.mjs`,
// replacing what `@nuxt/module-builder` used to generate:
//   - `module.json`: module metadata Nuxt reads. Keep the `meta` fields in sync with
//     `defineNuxtModule({ meta })` in `src/module.ts`.
//   - `types.d.ts`: the type entry referenced by the `./module` export.

const outDir = 'build/module';
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));

writeFileSync(
  join(outDir, 'module.json'),
  `${JSON.stringify(
    {
      name: '@sentry/nuxt/module',
      configKey: 'sentry',
      compatibility: { nuxt: '>=3.7.0' },
      version,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(join(outDir, 'types.d.ts'), "export { type ModuleOptions, default } from './module'\n");
