import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import { replacePlugin } from 'rolldown/plugins';

const downlevelLogicalAssignmentsPlugin = {
  name: 'downlevel-logical-assignments',
  renderChunk(code) {
    // ES2021 logical assignment operators (`||=`, `&&=`, `??=`) are not allowed by our ES2020 compatibility check.
    // OTEL currently ships some of these, so we downlevel them in the final output.
    //
    // Note: This is intentionally conservative (only matches property access-like LHS) to avoid duplicating side effects.
    // IMPORTANT: Use regex literals (not `String.raw` + `RegExp(...)`) to avoid accidental double-escaping.
    let out = code;

    // ??=
    out = out.replace(/([A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)+)\s*\?\?=\s*([^;]+);/g, (_m, left, right) => {
      return `${left} = ${left} ?? ${right};`;
    });

    // ||=
    out = out.replace(/([A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)+)\s*\|\|=\s*([^;]+);/g, (_m, left, right) => {
      return `${left} = ${left} || ${right};`;
    });

    // &&=
    out = out.replace(/([A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)+)\s*&&=\s*([^;]+);/g, (_m, left, right) => {
      return `${left} = ${left} && ${right};`;
    });

    return { code: out, map: null };
  },
};

const baseConfig = makeBaseNPMConfig({
  entrypoints: ['src/index.ts'],
  bundledBuiltins: ['perf_hooks', 'util'],
  packageSpecificConfig: {
    context: 'globalThis',
    plugins: [
      replacePlugin(
        {
          'process.argv0': JSON.stringify(''), // needed because otel relies on process.argv0 for the default service name, but that api is not available in the edge runtime.
        },
        {
          preventAssignment: true,
          // Use negative lookahead/lookbehind instead of word boundaries so `process.argv0` is also replaced in
          // `process.argv0.length` (where `.` follows). Default `\b` delimiters don't match before `.`.
          delimiters: ['(?<![\\w$])', '(?![\\w$])'],
        },
      ),
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
      downlevelLogicalAssignmentsPlugin,
    ],
  },
});

// `makeBaseNPMConfig` marks dependencies/peers as external by default.
// For Edge, we must ensure the OTEL SDK bits which reference `process.argv0` are bundled so our replace() plugin applies.
const baseExternal = baseConfig.external;
baseConfig.external = (source, importer, isResolved) => {
  // Never treat these as external - they need to be inlined so `process.argv0` can be replaced.
  if (
    source === '@opentelemetry/resources' ||
    source.startsWith('@opentelemetry/resources/') ||
    source === '@opentelemetry/sdk-trace-base' ||
    source.startsWith('@opentelemetry/sdk-trace-base/')
  ) {
    return false;
  }

  if (typeof baseExternal === 'function') {
    return baseExternal(source, importer, isResolved);
  }

  if (Array.isArray(baseExternal)) {
    return baseExternal.includes(source);
  }

  if (baseExternal instanceof RegExp) {
    return baseExternal.test(source);
  }

  return false;
};

export default makeNPMConfigVariants(baseConfig);
