import type { Nuxt } from '@nuxt/schema';
import type { NitroConfig } from 'nitropack';

// `@vercel/nft` only traces the `module-sync` target of a package's `exports` map when the Node
// process *running the build* is >= 22, but Node's CJS loader matches `module-sync` at runtime from
// 20.19. A Nitro server built on Node 20 is therefore missing files its own runtime resolves (e.g.
// `meriyah/dist/meriyah.mjs`, reached through `@apm-js-collab/code-transformer`) and crashes with
// `MODULE_NOT_FOUND`. nft's `moduleSyncCatchall` option (>= 1.10.0, ignored by older versions)
// makes it emit both targets regardless of the build Node version.
//
// Remove once https://github.com/vercel/nft/issues/603 is fixed and picked up by Nitro.

type TraceOptionsWithModuleSyncCatchall = { moduleSyncCatchall?: boolean } & Record<string, unknown>;

/**
 * Configures Nitro's externals tracing to emit all `module-sync` exports targets, independent of
 * the Node.js version running the build. See the comment above for background.
 */
export function setupModuleSyncTracing(nuxt: Nuxt, isNitroV3: boolean): void {
  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (nuxt.options?._prepare) {
      return;
    }

    const externals = (nitroConfig.externals ||= {});

    if (isNitroV3) {
      // Nitro v3: options are forwarded to nft via `externals.trace.nft`. `trace: false` disables
      // tracing entirely and must be respected.
      const externalsV3 = externals as { trace?: false | { nft?: TraceOptionsWithModuleSyncCatchall } };
      const trace = externalsV3.trace ?? {};
      if (trace === false) {
        return;
      }
      trace.nft = { moduleSyncCatchall: true, ...trace.nft };
      externalsV3.trace = trace;
    } else {
      // Nitro v2: `externals.traceOptions` is spread directly into `nodeFileTrace()`.
      const externalsV2 = externals as { traceOptions?: TraceOptionsWithModuleSyncCatchall };
      externalsV2.traceOptions = { moduleSyncCatchall: true, ...externalsV2.traceOptions };
    }
  });
}
