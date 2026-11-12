import node from '@astrojs/node';
import sentry from '@sentry/astro/integration';
import { defineConfig } from 'astro/config';
import * as fs from 'node:fs';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';
const noUpload = !!process.env.E2E_NO_UPLOAD;

// Records the source maps each environment made, before the Sentry plugin removes them in its
// `generateBundle` with `order: 'post'`. Rolldown emits no map for chunks without mappable source
// (e.g. virtual modules or its runtime), so their debug IDs can't be uploaded.
function recordSourceMaps() {
  return {
    name: 'record-source-maps',
    apply: 'build',
    generateBundle(_options, bundle) {
      const maps = Object.keys(bundle).filter(fileName => fileName.endsWith('.map'));
      fs.appendFileSync('.tmp_source_maps_made', `${this.environment.name} ${maps.length}\n`);

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || bundle[`${output.fileName}.map`]) {
          continue;
        }
        for (const match of output.code.matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
          fs.appendFileSync('.tmp_debug_ids_without_source_map', `${match[1].toLowerCase()}\n`);
        }
      }
    },
  };
}

// Static output allows no on-demand routes, so the SSR page is only added for server output
const ssrRoute = {
  name: 'ssr-route',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/ssr', entrypoint: './src/routes/ssr.astro' });
    },
  },
};

export default defineConfig({
  integrations: [
    sentry({
      sentryUrl: 'http://localhost:3032',
      authToken: noUpload ? undefined : 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    }),
    ...(isStatic ? [] : [ssrRoute]),
  ],
  // Keeps Astro from inlining the small client script into the HTML, where it would get no source map
  vite: { build: { assetsInlineLimit: 0 }, plugins: [recordSourceMaps()] },
  // The removal must follow the configured output directory
  ...(noUpload && { outDir: './build' }),
  output: isStatic ? 'static' : 'server',
  adapter: isStatic ? undefined : node({ mode: 'standalone' }),
});
