import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { installGlobals } from '@remix-run/node';

installGlobals();

export default defineConfig({
  plugins: [
    remix(),
    tsconfigPaths({
      // The dev server config errors are not relevant to this test app
      // https://github.com/aleclarson/vite-tsconfig-paths?tab=readme-ov-file#options
      ignoreConfigErrors: true,
    }),
  ],
});
