import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// Solid ships three build tiers behind export conditions (`development`,
// `observe`, default = production). The SDK's tracing integrations need the
// `observe` tier; Vite's resolver always prefers `development` in test mode,
// so the tier is pinned by aliasing each package to its observe artifact —
// the same files for the SDK and for Solid's own internal imports, so every
// module sees one instance. Two projects: the browser and server halves are
// different artifacts of the same packages.
const solid = (pkg: string) => resolve(__dirname, '../../node_modules/@solidjs', pkg);
const solidJs = resolve(__dirname, 'node_modules/solid-js');

function project(name: string, platform: 'browser' | 'server', environment: string) {
  const alias = [
    { find: /^solid-js$/, replacement: `${solidJs}/dist/${platform === 'browser' ? 'solid' : 'server'}.observe.js` },
    { find: /^solid-js\/attribution$/, replacement: `${solidJs}/dist/attribution.js` },
    { find: /^solid-js\/internal$/, replacement: `${solidJs}/dist/internal.js` },
    {
      find: /^@solidjs\/web$/,
      replacement: `${solid('web')}/dist/${platform === 'browser' ? 'web' : 'server'}.observe.js`,
    },
    { find: /^@solidjs\/signals$/, replacement: `${solid('signals')}/dist/observe/index.js` },
    { find: /^@solidjs\/signals\/attribution$/, replacement: `${solid('signals')}/dist/observe/attribution.js` },
  ];
  return {
    extends: true as const,
    resolve: { alias },
    server: { deps: { inline: [/solid-server-dev/, /solid-js/, /@solidjs/] } },
    test: {
      name,
      environment,
      include: [`test/${name}/**/*.test.ts`],
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
