import { build } from 'vite';
import { nodeExternals } from './node-externals.mjs';

// The Sentry vite plugin's build-time transform only applies to server builds (it gates itself on
// `consumer === 'server'`), so this is an SSR build rather than a client `lib` build.
export function bundle({ entry, outDir, external, plugins }) {
  return build({
    logLevel: 'silent',
    // A Vite SSR build externalizes node_modules deps by default, ignoring `rollupOptions.external`, so
    // graphql is inlined or kept external via `ssr.noExternal` / `ssr.external`. `ssr.external` also
    // wins over the plugin's own `noExternal` force-bundle.
    ssr: external ? { external: ['graphql'] } : { noExternal: ['graphql'] },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      // Vite otherwise defaults to a browser target that rejects top-level await.
      target: 'esnext',
      ssr: entry,
      rollupOptions: {
        external: nodeExternals,
        output: { entryFileNames: 'main.mjs', format: 'es' },
      },
    },
    plugins,
  });
}
