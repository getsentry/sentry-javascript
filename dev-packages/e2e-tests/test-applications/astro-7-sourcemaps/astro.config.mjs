import node from '@astrojs/node';
import sentry from '@sentry/astro/integration';
import { defineConfig } from 'astro/config';
import * as fs from 'node:fs';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';

// Rolldown emits no map for chunks without mappable source (e.g. virtual modules or its runtime), so their debug
// IDs can't be uploaded. Recorded here because the SDK deletes all maps after the upload.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build',
    enforce: 'post',
    writeBundle(_options, bundle) {
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
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    }),
    ...(isStatic ? [] : [ssrRoute]),
  ],
  // Keeps Astro from inlining the small client script into the HTML, where it would get no source map
  vite: { build: { assetsInlineLimit: 0 }, plugins: [recordChunksWithoutSourceMap()] },
  output: isStatic ? 'static' : 'server',
  adapter: isStatic ? undefined : node({ mode: 'standalone' }),
});
