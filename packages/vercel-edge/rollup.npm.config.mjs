import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants, plugins } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts'],
    bundledBuiltins: ['perf_hooks', 'util'],
    packageSpecificConfig: {
      context: 'globalThis',
      output: {
        preserveModules: false,
      },
      plugins: [
        plugins.makeCommonJSPlugin({ transformMixedEsModules: true }), // Needed because various modules in the OTEL toolchain use CJS (require-in-the-middle, shimmer, etc..)
        plugins.makeJsonPlugin(), // Needed because `require-in-the-middle` imports json via require
        replace({
          preventAssignment: true,
          values: {
            'process.argv0': JSON.stringify(''), // needed because otel relies on process.argv0 for the default service name, but that api is not available in the edge runtime.
          },
        }),
        {
          // This plugin is needed because otel imports `performance` from `perf_hooks` and also uses it via the `performance` global.
          // It also imports `inspect` and `promisify` from node's `util` which are not available in the edge runtime so we need to define a polyfill.
          // Both of these APIs are not available in the edge runtime so we need to define a polyfill.
          // Vercel does something similar in the `@vercel/otel` package: https://github.com/vercel/otel/blob/087601ae585cb116bb2b46c211d014520de76c71/packages/otel/build.ts#L62
          name: 'edge-runtime-polyfills',
          banner: `
            {
              if (globalThis.performance === undefined) {
                globalThis.performance = {
                  timeOrigin: 0,
                  now: () => Date.now()
                };
              }
            }
          `,
          resolveId: source => {
            if (source === 'perf_hooks') {
              return '\0perf_hooks_sentry_shim';
            } else if (source === 'util') {
              return '\0util_sentry_shim';
            } else {
              return null;
            }
          },
          load: id => {
            if (id === '\0perf_hooks_sentry_shim') {
              return `
                export const performance = {
                  timeOrigin: 0,
                  now: () => Date.now()
                }
              `;
            } else if (id === '\0util_sentry_shim') {
              return `
                export const inspect = (object) =>
                  JSON.stringify(object, null, 2);

                export const promisify = (fn) => {
                  return (...args) => {
                    return new Promise((resolve, reject) => {
                      fn(...args, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                      });
                    });
                  };
                };
              `;
            } else {
              return null;
            }
          },
        },
      ],
    },
  }),
);
