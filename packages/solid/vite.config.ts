import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// Solid 1 and Solid 2 are both dev dependencies of this package: `solid-js` is 1.x for
// the root and router entry points, `solid-js-2` (an npm alias) is 2.x for `solid2/`.
//
// Solid 2 ships three build tiers behind export conditions (`development`,
// `observe`, default = production). The Solid 2 tracing integrations need the
// `observe` tier; Vite's resolver always prefers `development` in test mode,
// so the tier is pinned by aliasing each package to its observe artifact —
// the same files for the SDK and for Solid's own internal imports, so every
// module sees one instance. The browser and server halves are different
// artifacts of the same packages, so they are separate projects.
const require = createRequire(join(__dirname, 'package.json'));
/** The install root of a package as this package resolves it. */
function packageRoot(pkg: string): string {
  let dir = dirname(require.resolve(pkg));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return dir;
}

function solid2Project(name: 'client' | 'server', environment: string) {
  const platform = name === 'client' ? 'browser' : 'server';
  const solidJs = packageRoot('solid-js-2');
  const web = packageRoot('@solidjs/web');
  const signals = packageRoot('@solidjs/signals');
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
      name: `solid2-${name}`,
      environment,
      include: [`test/solid2/${name}/**/*.test.ts`],
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
    projects: [
      {
        extends: true,
        plugins: [solidPlugin({ hot: !process.env.VITEST })],
        test: {
          name: 'solid',
          environment: 'jsdom',
          include: ['test/*.test.{ts,tsx}'],
        },
      },
      solid2Project('client', 'jsdom'),
      solid2Project('server', 'node'),
    ],
  },
});
