import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// The Nuxt module ships two kinds of output that live side by side in `build/module`:
//   - `module.mjs`: the module entry, bundled from `src/module.ts`.
//   - `runtime/**`: the files Nuxt injects into the consuming app, emitted one-to-one
//     (never bundled) because the app's own build re-processes them.
// This config replaces `@nuxt/module-builder` so the package builds with plain rolldown + tsc
// and doesn't couple us to a build tool that consumes the TypeScript compiler API.

// Anything that isn't a relative path is provided by the consuming app or Node at runtime
// (this covers `@sentry/*`, `nuxt/app`, `#imports`, node builtins), so it stays external.
const isExternal = id => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0');

function runtimeEntrypoints(dir = 'src/runtime', acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      runtimeEntrypoints(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }

  return acc;
}

// Don't read a per-package tsconfig; pin only what affects codegen.
const transpile = { tsconfig: false, transform: { target: 'es2020' } };

export default [
  {
    ...transpile,
    input: 'src/module.ts',
    output: { file: 'build/module/module.mjs', format: 'esm', sourcemap: false },
    external: isExternal,
  },
  {
    ...transpile,
    input: runtimeEntrypoints(),
    output: {
      dir: 'build/module/runtime',
      format: 'esm',
      sourcemap: false,
      preserveModules: true,
      preserveModulesRoot: 'src/runtime',
      entryFileNames: '[name].js',
    },
    external: isExternal,
  },
];
