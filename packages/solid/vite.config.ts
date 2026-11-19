import { fileURLToPath } from 'node:url';
import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

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
          include: ['test/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        // `solid-js` is a 1.x dev dependency, so Solid 2 is installed under the `solid-js-2` alias.
        // Point at its browser production build: Vitest would otherwise pick the non-reactive server build.
        resolve: {
          alias: [
            {
              find: /^solid-js$/,
              replacement: fileURLToPath(new URL('./node_modules/solid-js-2/dist/solid.js', import.meta.url)),
            },
            {
              find: /^solid-js\/internal$/,
              replacement: fileURLToPath(new URL('./node_modules/solid-js-2/dist/internal.js', import.meta.url)),
            },
            {
              find: /^@solidjs\/web$/,
              replacement: fileURLToPath(new URL('./node_modules/@solidjs/web/dist/web.js', import.meta.url)),
            },
            {
              find: /^@solidjs\/router$/,
              replacement: fileURLToPath(new URL('./node_modules/@solidjs/router-2/dist/index.js', import.meta.url)),
            },
          ],
        },
        test: {
          name: 'solid2',
          environment: 'jsdom',
          include: ['test/solid2/**/*.test.ts'],
          typecheck: { tsconfig: './test/solid2/tsconfig.json' },
          // Process Solid's packages with Vite, so the aliases above also apply to their own imports.
          server: { deps: { inline: [/solid-js/, /@solidjs/] } },
        },
      },
    ],
  },
});
