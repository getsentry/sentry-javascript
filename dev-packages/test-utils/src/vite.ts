import { isAbsolute, resolve } from 'node:path';

interface ResolvedId {
  id: string;
}

interface ResolveContext {
  resolve(source: string, importer?: string, options?: Record<string, unknown>): Promise<ResolvedId | null>;
}

/** The subset of a Vite plugin that {@link runtimeEntryPlugin} returns, so this package needs no `vite` dependency. */
export interface RuntimeEntryPlugin {
  name: string;
  enforce: 'pre';
  configResolved(config: { root: string }): void;
  resolveId(
    this: ResolveContext,
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ): Promise<string | null>;
}

/**
 * Makes Vite load `<name>.<runtime><ext>` in place of `file`, for a server entry that the framework
 * does not let you configure. `file` is relative to the Vite root.
 *
 * @example
 * ```ts
 * // vite.cloudflare.config.ts, loads `app/entry.server.cloudflare.tsx` in place of `app/entry.server.tsx`
 * import { runtimeEntryPlugin } from '@sentry-internal/test-utils/vite';
 *
 * export default defineConfig({
 *   plugins: [runtimeEntryPlugin('app/entry.server.tsx', 'cloudflare'), cloudflare(), reactRouter()],
 * });
 * ```
 */
export function runtimeEntryPlugin(file: string, runtime: string): RuntimeEntryPlugin {
  let entry = resolve(file);

  return {
    name: 'sentry-test-runtime-entry',
    enforce: 'pre',
    configResolved(config) {
      entry = isAbsolute(file) ? file : resolve(config.root, file);
    },
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === entry ? entry.replace(/(\.[^./]+)$/, `.${runtime}$1`) : null;
    },
  };
}
