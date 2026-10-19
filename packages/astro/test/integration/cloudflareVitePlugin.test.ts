import { describe, expect, it } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/integration/cloudflare';

function transform(code: string, id: string) {
  const plugin = sentryCloudflareVitePlugin() as { transform: (code: string, id: string) => unknown };
  return plugin.transform(code, id);
}

describe('sentryCloudflareVitePlugin', () => {
  it('wraps the default export of the @astrojs/cloudflare v12 virtual entry', () => {
    const code = ['const _exports = createExports(manifest);', 'export default _exports.default;'].join('\n');

    expect(transform(code, '\0@astrojs-ssr-virtual-entry')).toEqual({
      code: [
        "import { withSentry } from '@sentry/cloudflare';",
        'const _exports = createExports(manifest);',
        'export default withSentry(() => undefined, _exports.default);',
      ].join('\n'),
      map: null,
    });
  });

  it('wraps the default export of the @cloudflare/vite-plugin worker entry', () => {
    const code = [
      'import { getExportTypes } from "virtual:cloudflare/export-types";',
      'import * as mod from "virtual:cloudflare/user-entry";',
      'export * from "virtual:cloudflare/user-entry";',
      'export default mod.default ?? {};',
      'if (import.meta.hot) { import.meta.hot.accept(); }',
    ].join('\n');

    expect(transform(code, '\0virtual:cloudflare/worker-entry')).toEqual({
      code: [
        "import { withSentry } from '@sentry/cloudflare';",
        'import { getExportTypes } from "virtual:cloudflare/export-types";',
        'import * as mod from "virtual:cloudflare/user-entry";',
        'export * from "virtual:cloudflare/user-entry";',
        'export default withSentry(() => undefined, mod.default ?? {});',
        'if (import.meta.hot) { import.meta.hot.accept(); }',
      ].join('\n'),
      map: null,
    });
  });

  it('leaves other modules alone', () => {
    expect(transform('export default handler;', '/src/pages/index.astro')).toBeUndefined();
  });
});
