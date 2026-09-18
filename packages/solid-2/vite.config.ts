import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// Solid ships three build tiers behind export conditions (`development`,
// `observe`, default = production). The SDK's tracing integrations need the
// `observe` tier; Vite's resolver always prefers `development` in test mode,
// so the tier is pinned by aliasing each package to its observe artifact —
// the same files for the SDK and for Solid's own internal imports, so every
// module sees one instance. Two projects: the browser and server halves are
// different artifacts of the same packages.
const require = createRequire(join(__dirname, 'package.json'));
/** The install root of a package as this package resolves it (Solid 1.x lives at the workspace root for @sentry/solid). */
function packageRoot(pkg: string): string {
  let dir = dirname(require.resolve(pkg));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return dir;
}
const solidJs = packageRoot('solid-js');
const web = packageRoot('@solidjs/web');
const signals = packageRoot('@solidjs/signals');

function project(name: string, platform: 'browser' | 'server', environment: string) {
  const alias = [
    { find: /^solid-js$/, replacement: `${solidJs}/dist/${platform === 'browser' ? 'solid' : 'server'}.observe.js` },
    { find: /^solid-js\/attribution$/, replacement: `${solidJs}/dist/attribution.js` },
    { find: /^solid-js\/internal$/, replacement: `${solidJs}/dist/internal.js` },
    {
      find: /^@solidjs\/web$/,
      replacement: `${web}/dist/${platform === 'browser' ? 'web' : 'server'}.observe.js`,
    },
    { find: /^@solidjs\/signals$/, replacement: `${signals}/dist/observe/index.js` },
    { find: /^@solidjs\/signals\/attribution$/, replacement: `${signals}/dist/observe/attribution.js` },
  ];
  return {
    extends: true as const,
    resolve: { alias },
    test: {
      name,
      environment,
      include: [`test/${name}/**/*.test.ts`],
      // Keep Solid inside Vite's pipeline (where the aliases apply) rather
      // than Node's loader: a package Node loads natively beside one Vite
      // inlines is two module instances, two `OBSERVE`s.
      server: { deps: { inline: [/solid-js/, /@solidjs/] } },
    },
  };
}

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    projects: [project('client', 'browser', 'jsdom'), project('server', 'server', 'node')],
  },
});
