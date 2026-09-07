import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/integration/cloudflare';

/** The body `@cloudflare/vite-plugin` generates for the Worker entry (adapter v13+). */
const CLOUDFLARE_WORKER_ENTRY = `
import { getExportTypes } from "virtual:cloudflare/export-types";
import * as mod from "virtual:cloudflare/user-entry";
export * from "virtual:cloudflare/user-entry";
export default mod.default ?? {};
`;

/** What Astro's own SSR entry looked like with adapter v12. */
const ASTRO_SSR_ENTRY = `
import { App } from 'astro/app';
const _default = { fetch: handle };
export default _default;
`;

function transform(
  code: string,
  id: string,
  context: { environment?: { name?: string }; parse?: unknown } = {},
): { code: string; map: null } | undefined {
  const plugin = sentryCloudflareVitePlugin() as any;
  const ctx = {
    parse: (source: string) => parse(source, { ecmaVersion: 'latest', sourceType: 'module' }),
    ...context,
  };

  return plugin.transform.call(ctx, code, id);
}

describe('sentryCloudflareVitePlugin', () => {
  describe('module ids it wraps', () => {
    it('wraps the @cloudflare/vite-plugin worker entry (adapter v13+)', () => {
      const result = transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/worker-entry');

      expect(result?.code).toContain("import { withSentry } from '@sentry/cloudflare';");
      expect(result?.code).toContain('const __SENTRY_DEFAULT_EXPORT__ = mod.default ?? {};');
      expect(result?.code).toContain('export default withSentry(() => undefined, __SENTRY_DEFAULT_EXPORT__);');
    });

    it("wraps Astro's SSR entry (adapter v12)", () => {
      const result = transform(ASTRO_SSR_ENTRY, '\0@astrojs-ssr-virtual-entry');

      expect(result?.code).toContain('const __SENTRY_DEFAULT_EXPORT__ = _default;');
      expect(result?.code).toContain('export default withSentry(() => undefined, __SENTRY_DEFAULT_EXPORT__);');
    });

    it('keeps the rest of the module intact', () => {
      const result = transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/worker-entry');

      expect(result?.code).toContain('export * from "virtual:cloudflare/user-entry";');
      expect(result?.code).toContain('import * as mod from "virtual:cloudflare/user-entry";');
    });

    it('leaves any other module alone', () => {
      expect(transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/export-types')).toBeUndefined();
      expect(transform(ASTRO_SSR_ENTRY, '/src/pages/index.astro')).toBeUndefined();
    });
  });

  describe('environments', () => {
    it.each(['client', 'prerender'])('skips the %s environment', name => {
      const result = transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/worker-entry', {
        environment: { name },
      });

      expect(result).toBeUndefined();
    });

    it('wraps the ssr environment', () => {
      const result = transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/worker-entry', {
        environment: { name: 'ssr' },
      });

      expect(result?.code).toContain('withSentry(');
    });
  });

  describe('modules it cannot rewrite', () => {
    it('leaves a module without a default export alone', () => {
      const result = transform('export const handler = {};', '\0virtual:cloudflare/worker-entry');

      expect(result).toBeUndefined();
    });

    it('leaves a module it cannot parse alone', () => {
      const result = transform(CLOUDFLARE_WORKER_ENTRY, '\0virtual:cloudflare/worker-entry', {
        parse: () => {
          throw new Error('unparseable');
        },
      });

      expect(result).toBeUndefined();
    });
  });
});
