import type * as fs from 'fs';
import { vi } from 'vitest';

import { injectSentryInitPlugin } from '../../src/vite/injectInitPlugin';

vi.mock('fs', async () => {
  const original = await vi.importActual<typeof fs>('fs');
  return {
    ...original,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

describe('injectSentryInitPlugin', () => {
  it('has its basic properties set', () => {
    expect(injectSentryInitPlugin.name).toBe('sentry-init-injection-plugin');
    expect(injectSentryInitPlugin.enforce).toBe('pre');
    expect(typeof injectSentryInitPlugin.transform).toBe('function');
  });

  describe('transform', () => {
    it('transforms the server index file', () => {
      const code = 'foo();';
      const id = '/node_modules/@sveltejs/kit/src/runtime/server/index.js';

      // @ts-ignore -- transform is definitely defined and callable. Seems like TS doesn't know that.
      const result = injectSentryInitPlugin.transform(code, id);

      expect(result.code).toMatch(/foo\(\);\n.*import ".*sentry\.server\.config\.ts";/gm);
      expect(result.map).toBeDefined();
    });

    it('transforms the client index file (dev server)', () => {
      const code = 'foo();';
      const id = '.svelte-kit/generated/client/app.js';

      // @ts-ignore -- transform is definitely defined and callable. Seems like TS doesn't know that.
      const result = injectSentryInitPlugin.transform(code, id);

      expect(result.code).toMatch(/foo\(\);\n.*import ".*sentry\.client\.config\.ts";/gm);
      expect(result.map).toBeDefined();
    });

    it('transforms the client index file (prod build)', () => {
      const code = 'foo();';
      const id = '.svelte-kit/generated/client-optimized/app.js';

      // @ts-ignore -- transform is definitely defined and callable. Seems like TS doesn't know that.
      const result = injectSentryInitPlugin.transform(code, id);

      expect(result.code).toMatch(/foo\(\);\n.*import ".*sentry\.client\.config\.ts";/gm);
      expect(result.map).toBeDefined();
    });

    it("doesn't transform other files", () => {
      const code = 'foo();';
      const id = './src/routes/+page.ts';

      // @ts-ignore -- transform is definitely defined and callable. Seems like TS doesn't know that.
      const result = injectSentryInitPlugin.transform(code, id);

      expect(result).toBe(code);
    });
  });
});
