import { resolve } from 'node:path';
import { buildOptionsImport, ENV_FALLBACK_OPTIONS_FN, resolveInstrumentFile } from './instrumentFile';
import { applyAutoInstrumentTransforms, type ProgramBody } from './transform';
import { resolveWranglerConfig, type WranglerConfig } from './wranglerConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

export interface SentryCloudflareAutoInstrumentOptions {
  /**
   * Path to the wrangler configuration file. Auto-detected from the Vite
   * project root when omitted (tries `wrangler.toml`, `wrangler.json`,
   * `wrangler.jsonc` in order).
   */
  wranglerConfigPath?: string;
}

export function sentryCloudflareAutoInstrumentPlugin(
  pluginOptions: SentryCloudflareAutoInstrumentOptions = {},
): UnknownPlugin {
  let wranglerConfig: WranglerConfig | undefined;
  let entryFilePath: string | undefined;

  let optionsFn = ENV_FALLBACK_OPTIONS_FN;
  let optionsImport: string | undefined;

  return {
    name: 'sentry-cloudflare-auto-instrument',

    configResolved(config: { root: string; logger?: { warn(msg: string): void } }): void {
      const result = resolveWranglerConfig(config.root, pluginOptions.wranglerConfigPath);
      if (!result) {
        config.logger?.warn('[sentry] No wrangler config found — auto-instrumentation disabled.');
        return;
      }

      wranglerConfig = result.config;
      if (wranglerConfig.main) {
        entryFilePath = resolve(result.configDir, wranglerConfig.main);
      }

      if (entryFilePath) {
        const instrumentFilePath = resolveInstrumentFile(entryFilePath);
        if (instrumentFilePath) {
          const built = buildOptionsImport(entryFilePath, instrumentFilePath);
          optionsFn = built.optionsFn;
          optionsImport = built.importStmt;
        }
      }
    },

    transform(
      this: { parse(code: string): ProgramBody },
      code: string,
      id: string,
    ): { code: string; map: unknown } | undefined {
      if (!wranglerConfig || !entryFilePath) return undefined;

      // Vite may append query/hash params to the module ID.
      const normalizedId = id.replace(/[?#].*$/, '');
      if (normalizedId !== entryFilePath) {
        // Tolerate a missing or different extension (e.g. `.tsx` vs `.ts`).
        const stripExt = (p: string): string => p.replace(/\.\w+$/, '');
        if (stripExt(normalizedId) !== stripExt(entryFilePath)) return undefined;
      }

      let ast: ProgramBody;
      try {
        ast = this.parse(code);
      } catch {
        // Raw TypeScript or syntax error — esbuild hasn't run yet (unlikely)
        // or the file is genuinely broken.  Either way, skip silently.
        return undefined;
      }

      const doClassNames = new Set(wranglerConfig.durableObjects.map(d => d.className));
      return applyAutoInstrumentTransforms(code, ast, { doClassNames, optionsFn, optionsImport }) ?? undefined;
    },
  };
}
